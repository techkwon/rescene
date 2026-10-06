// Reads `fleet-run <profile> --spec <file> --out <file>` out of a shell
// command: the Orca worker launches the conductor makes through Bash.

import type { Tokens } from '../types'
import { t } from './lang'

export type FleetRun = {
  profile: string
  /** The spec's path as the command spells it, quotes and all. */
  rawSpec?: string
  /** The paths with the command's own variables filled in, when plain. */
  spec?: string
  out?: string
  title: string
}

const PLAIN = /^[\w@%+=:,./~-]+$/
const ASSIGNED = /^([A-Za-z_]\w*)=(.*)$/s
/** Words a step may open with before the command it runs. */
const LEADS = new Set(['if', 'while', 'until', 'then', 'do', 'else', 'elif', '{', '!', 'time', 'nohup', 'exec', 'command'])
/** The shells whose `-c` takes a command to run; anything else's `-c` is its own flag (`grep -c`). */
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh'])
const DECLARES = new Set(['export', 'local', 'typeset', 'readonly', 'declare'])

/**
 * The command as the shell reads its words: less the bodies of its
 * here-documents (what a script is fed is not run), continued lines joined.
 * `<<<` is a here-string and `1<<3` arithmetic; `<<\EOF` and an empty body count.
 */
const asRun = (command: string): string =>
  command
    .replace(/(?<![<\d])<<(?!<)-?[ \t]*\\?(['"]?)(\w+)\1([^\n]*)\n(?:[\s\S]*?\n)?[ \t]*\2[ \t]*(?=\n|$)/g, (_whole, _quote, _tag, rest: string) => rest)
    .replace(/\\\n/g, ' ')

/**
 * A command's steps, each its words as written, quotes and all: what stands
 * between `;`, `&`, `|`, a newline and parentheses. A quoted stretch is one
 * word's, a comment nobody's, and `$(...)` and `${...}` stay in their word.
 */
const stepsOf = (text: string): string[][] => {
  const steps: string[][] = []
  let words: string[] = []
  let word = ''
  let quote = ''
  const endWord = (): void => {
    if (word !== '') words.push(word)
    word = ''
  }
  const endStep = (): void => {
    endWord()
    if (words.length > 0) steps.push(words)
    words = []
  }

  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at)

    if (quote !== '') {
      word += char
      if (char === '\\' && quote === '"') {
        word += text.charAt(at + 1)
        at += 1
      } else if (char === quote) quote = ''
    } else if (char === '\\') {
      word += char + text.charAt(at + 1)
      at += 1
    } else if (char === '"' || char === "'") {
      quote = char
      word += char
    } else if (char === '$' && (text.charAt(at + 1) === '(' || text.charAt(at + 1) === '{')) {
      const close = text.charAt(at + 1) === '(' ? ')' : '}'
      const open = text.charAt(at + 1)
      let depth = 0
      let end = at + 1

      for (; end < text.length; end += 1) {
        if (text.charAt(end) === open) depth += 1
        else if (text.charAt(end) === close && (depth -= 1) === 0) break
      }
      word += text.slice(at, end + 1)
      at = end
    } else if (char === '#' && word === '') {
      while (at < text.length && text.charAt(at) !== '\n') at += 1
      endStep()
    } else if (char === '\n' || char === ';' || char === '|' || char === '&' || char === '(' || char === ')') endStep()
    else if (char === ' ' || char === '\t') endWord()
    else word += char
  }
  endStep()

  return steps
}

/** A word as the shell hands it on, where that can be told: its quotes off, the variables known so far filled in. */
const resolve = (word: string, vars: ReadonlyMap<string, string>, home: string | undefined): string | undefined => {
  // Single quotes keep their dollars; a word quoted in part is not followed.
  if (/^'[^']*'$/.test(word)) return PLAIN.test(word.slice(1, -1)) ? word.slice(1, -1) : undefined
  if (word.includes("'") || word.includes('`') || word.includes('$(')) return undefined
  const filled = word.replace(/\\?"/g, '').replace(/\$\{(\w+)\}|\$(\w+)/g, (whole, braced: string | undefined, bare: string | undefined) => {
    return vars.get(braced ?? bare ?? '') ?? whole
  })
  const expanded = home !== undefined && filled.startsWith('~/') ? `${home}${filled.slice(1)}` : filled

  return PLAIN.test(expanded) && !expanded.startsWith('~') ? expanded : undefined
}

/** The value of `--name value` or `--name=value` among a step's words, as written. */
const option = (words: readonly string[], name: string): string | undefined => {
  for (const [at, word] of words.entries()) {
    // A flag with nothing after it but the next flag has no value.
    if (word === `--${name}`) return words[at + 1]?.startsWith('--') === true ? undefined : words[at + 1]
    if (word.startsWith(`--${name}=`)) return word.slice(name.length + 3)
  }

  return undefined
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

/** What a quoted word holds, read as a command of its own: a `--command "..."`, a `-c '...'`. */
const inner = (word: string): string | undefined => {
  if (/^'[^']*'$/.test(word)) return word.slice(1, -1)
  if (/^"[\s\S]*"$/.test(word)) return word.slice(1, -1).replace(/\\(["\\$`])/g, '$1')

  return undefined
}

const scan = (text: string, vars: Map<string, string>, home: string | undefined, runs: FleetRun[]): void => {
  for (const words of stepsOf(text)) {
    let at = 0

    while (at < words.length && (LEADS.has(words[at] ?? '') || ASSIGNED.test(words[at] ?? ''))) at += 1
    const head = words[at]

    // A step that only assigns, or declares, is what later steps' variables read.
    if (head === undefined || DECLARES.has(head)) {
      for (const word of words) {
        const [, name, value] = ASSIGNED.exec(word) ?? []
        const set = name === undefined || value === undefined ? undefined : resolve(value, vars, home)

        if (name !== undefined && set !== undefined) vars.set(name, set)
        else if (name !== undefined) vars.delete(name)
      }
      continue
    }
    if (head === 'fleet-run') {
      const [profile, ...args] = words.slice(at + 1)
      const rawSpec = option(args, 'spec')
      const rawOut = option(args, 'out')

      // A worker is launched with its spec; without one the step only names the tool.
      if (profile === undefined || !/^[a-z]+-[a-z]+$/.test(profile) || rawSpec === undefined) continue
      const spec = resolve(rawSpec, vars, home)
      const out = rawOut === undefined ? undefined : resolve(rawOut, vars, home)
      const named = baseName(spec ?? out ?? '').replace(/\.(?:spec|out)\.md$|\.md$/, '')

      runs.push({ profile, rawSpec, spec, out, title: named === '' ? profile : named })
      continue
    }
    // A command handed on as one quoted word runs too: `orca terminal create --command "..."`, `zsh -c '...'`.
    for (const [index, word] of words.entries()) {
      const isHanded = word === '--command' || (SHELLS.has(head.slice(head.lastIndexOf('/') + 1)) && /^-[a-z]*c$/.test(word))
      const handed = index > at && isHanded ? inner(words[index + 1] ?? '') : undefined

      if (handed !== undefined) scan(handed, new Map(vars), home, runs)
    }
  }
}

/**
 * The workers a command launches: `fleet-run` where the shell runs it, not
 * where a `grep` or an `echo` is handed its name, with the variables each
 * launch reads as the steps before it left them.
 */
export const findFleetRuns = (command: string, home?: string): FleetRun[] => {
  const runs: FleetRun[] = []

  scan(asRun(command), new Map(), home, runs)

  return runs
}

/** A command that is one launch and nothing else: no second step, no pipe, no redirect. */
export const isPlainLaunch = (command: string): boolean => {
  const run = asRun(command).trim()
  const steps = stepsOf(run)
  // What stands outside quotes: nothing may be appended after a comment or a second line.
  const bare = run.replace(/"[^"]*"|'[^']*'/g, '')

  return steps.length === 1 && steps[0]?.[0] === 'fleet-run' && !steps[0].some(word => /[<>`]|\$\(/.test(word)) && !/[|&;\n]|(?:^|\s)#/.test(bare)
}

/** Whether the command hands the worker to something that returns at once. */
export const isDetached = (command: string): boolean =>
  /\borca\s+terminal\s+create\b|\bnohup\b|&\s*(?:$|\n|disown)/.test(command)

/**
 * Where a member's copy of a spec goes: beside it, under her name, so two
 * workers launched on one spec each read their own.
 */
export const voicedSpecPath = (spec: string, tag: string): string =>
  spec.endsWith('.md') ? `${spec.slice(0, -3)}.rescene-${tag}.md` : `${spec}.rescene-${tag}.md`

export type Meta = { isOk: boolean; note: string; tokens?: Tokens }

const count = (usage: Record<string, unknown>, key: string): number => {
  const value = usage[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * A worker's usage as one shape. Each engine spells its own: Codex counts
 * the cached tokens inside `input_tokens`, the others beside them.
 */
export const readTokens = (usage: unknown): Tokens | undefined => {
  if (typeof usage !== 'object' || usage === null) return undefined
  const row = usage as Record<string, unknown>
  const inside = count(row, 'cached_input_tokens')
  const cached = inside + count(row, 'cache_read_input_tokens') + count(row, 'cache_read_tokens')
  const fresh = count(row, 'input_tokens') - inside + count(row, 'cache_creation_input_tokens')
  const out = count(row, 'output_tokens')
  const usd = typeof row.cost_usd === 'number' ? row.cost_usd : undefined

  return fresh + cached + out === 0 && usd === undefined ? undefined : { fresh: Math.max(0, fresh), cached, out, usd }
}

/** What a worker's `<out>.meta.json` says about how it ended. */
export const readMeta = (text: string): Meta | undefined => {
  try {
    const meta: unknown = JSON.parse(text)

    if (typeof meta !== 'object' || meta === null) return undefined
    const { exit_code: code, model, seconds, status, usage } = meta as Record<string, unknown>
    // A meta file with no exit code is one still being written.
    if (typeof code !== 'number' || !Number.isFinite(code)) return undefined
    const isOk = code === 0
    const took = typeof seconds === 'number' ? t(`${Math.round(seconds)}초`, `${Math.round(seconds)}s`) : ''
    const how = isOk ? '' : typeof status === 'string' ? status : t(`종료 코드 ${String(code)}`, `exit code ${String(code)}`)
    const note = [typeof model === 'string' ? model : '', took, how].filter(part => part !== '').join(' · ')

    return { isOk, note, tokens: readTokens(usage) }
  } catch {
    return undefined
  }
}
