import type { Cast, MemberId, Role } from '../types'

import { t } from './lang'
import { CAST } from './members'

// Says a tool call in plain words (what is being done, and to what), and
// which member's kind of work it is when the main session does it itself.

export type Action = {
  member: MemberId
  /** While the call runs: `고치는 중: view.tsx`. */
  phrase: string
  /** Once it is over: `고침: view.tsx`. */
  past: string
}

const text = (input: Record<string, unknown>, key: string): string => {
  const value = input[key]

  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const host = (url: string): string => /^[a-z]+:\/\/([^/]+)/i.exec(url)?.[1] ?? url

const LOOKS = /^(?:ls|cat|head|tail|grep|rg|find|wc|stat|file|which|env|pwd|tree|du|jq)$/
const CHECKS = /^(?:tsc|eslint|pytest|jest|vitest|diff|shellcheck)$/
const RUNNERS = /^(?:npm|pnpm|yarn|bun|npx|cargo|go|make|claude|python3?|deno|gradle|mvn)$/

/** The first step the shell runs, as words: past the assignments and the `cd` a command opens with. */
const headOf = (command: string): string[] => {
  const steps = command.split(/&&|\|\||;|\n/).map(step => step.trim().replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, ''))
  return (steps.find(step => step !== '' && !/^(?:cd|export|set|source)\b/.test(step) && !/^[A-Za-z_]\w*=\S*$/.test(step)) ?? '').split(/\s+/)
}

/** A command as a few words to show: what it runs, not where it went first, with long paths down to their names. */
const shown = (command: string): string => {
  const words = headOf(command).map(word => (word.length > 24 && word.includes('/') ? `…/${baseName(word.replace(/\/+$/, ''))}` : word))

  return words.join(' ') || command
}

/** What kind of work a shell command is: its own first word says, and where that does not, its description. */
const roleOfShell = (command: string, description: string): Role => {
  const [first = '', ...rest] = headOf(command)
  const tool = baseName(first)

  if (tool === 'fleet-run' || tool === 'fleet-race' || (tool === 'orca' && /^(?:create|send|worker-start|task-create|dispatch)$/.test(rest[1] ?? ''))) return '지휘'
  if (CHECKS.test(tool) || (RUNNERS.test(tool) && rest.some(word => /^(?:test|lint|check|typecheck|validate|verify|pytest)$/.test(word)))) return '검토'
  if (/^(?:curl|wget)$/.test(tool) || (tool === 'gh' && rest[0] === 'api')) return '조사'
  if (tool === 'orca' || LOOKS.test(tool) || (tool === 'sed' && rest[0] === '-n') || (tool === 'git' && /^(?:status|log|show|diff|blame)$/.test(rest[0] ?? ''))) return '탐색'
  if (/고치|수정|추가|반영|바꾸|만들|구현|작성|\b(?:write|edit|fix|add|create|update|install|build)\b/i.test(description)) return '구현'
  if (/테스트|검사|검증|\b(?:test|check|verify|validate|lint|review)\b/i.test(description)) return '검토'
  if (/조사|내려받|\b(?:fetch|download|research)\b/i.test(description)) return '조사'
  if (/읽|찾|목록|보기|확인|\b(?:list|read|find|search|show|locate|inspect)\b/i.test(description)) return '탐색'

  return '구현'
}

const cut = (phrase: string): string => ([...phrase].length > 64 ? `${[...phrase].slice(0, 63).join('')}…` : phrase)

/** A tool call as the member whose kind of work it is and a phrase: `고치는 중: view.tsx`, `실행 중: 타입 검사`. */
export const actionOf = (tool: string, input: object, cast: Cast = CAST): Action => {
  const args = input as Record<string, unknown>
  const file = baseName(text(args, 'file_path') || text(args, 'notebook_path') || text(args, 'path'))
  const say = (role: Role, phrase: string, past: string): Action => ({ member: role === '지휘' ? 'woni' : cast[role], phrase: cut(phrase), past: cut(past) })

  switch (tool) {
    case 'Read':
      return say('탐색', t(`읽는 중: ${file}`, `Reading: ${file}`), t(`읽음: ${file}`, `Read: ${file}`))
    case 'Grep':
    case 'Glob':
      return say('탐색', t(`찾는 중: ${text(args, 'pattern')}`, `Searching: ${text(args, 'pattern')}`), t(`찾음: ${text(args, 'pattern')}`, `Searched: ${text(args, 'pattern')}`))
    case 'ToolSearch':
      return say('탐색', t(`도구 찾는 중: ${text(args, 'query')}`, `Finding a tool: ${text(args, 'query')}`), t(`도구 찾음: ${text(args, 'query')}`, `Found a tool: ${text(args, 'query')}`))
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return say('구현', t(`고치는 중: ${file}`, `Editing: ${file}`), t(`고침: ${file}`, `Edited: ${file}`))
    case 'Write':
      return say('구현', t(`쓰는 중: ${file}`, `Writing: ${file}`), t(`씀: ${file}`, `Wrote: ${file}`))
    case 'WebSearch':
      return say('조사', t(`검색 중: ${text(args, 'query')}`, `Searching the web: ${text(args, 'query')}`), t(`검색함: ${text(args, 'query')}`, `Searched the web: ${text(args, 'query')}`))
    case 'WebFetch':
      return say('조사', t(`웹 읽는 중: ${host(text(args, 'url'))}`, `Reading the web: ${host(text(args, 'url'))}`), t(`웹 읽음: ${host(text(args, 'url'))}`, `Read the web: ${host(text(args, 'url'))}`))
    case 'Skill':
      return say('조사', t(`스킬 여는 중: ${text(args, 'skill')}`, `Opening a skill: ${text(args, 'skill')}`), t(`스킬 엶: ${text(args, 'skill')}`, `Opened a skill: ${text(args, 'skill')}`))
    case 'Bash': {
      const command = text(args, 'command')
      const description = text(args, 'description')

      return say(roleOfShell(command, description), t(`실행 중: ${description || shown(command)}`, `Running: ${description || shown(command)}`), t(`실행함: ${description || shown(command)}`, `Ran: ${description || shown(command)}`))
    }
    case 'Agent':
      return say('지휘', t(`맡기는 중: ${text(args, 'description')}`, `Handing over: ${text(args, 'description')}`), t(`맡김: ${text(args, 'description')}`, `Handed over: ${text(args, 'description')}`))
    case 'AskUserQuestion':
      return say('지휘', t('사용자에게 묻는 중', 'Asking the person'), t('사용자에게 물음', 'Asked the person'))
    case 'SendMessage':
      return say('지휘', t('멤버에게 말 전하는 중', 'Messaging a member'), t('멤버에게 말 전함', 'Messaged a member'))
    case 'SubagentHandback':
      return say('지휘', t('보고 올리는 중', 'Reporting back'), t('보고 올림', 'Reported back'))
    case 'Artifact':
      return say('구현', t('페이지 만드는 중', 'Making a page'), t('페이지 만듦', 'Made a page'))
    default: {
      const short = tool.startsWith('mcp__') ? tool.slice(tool.lastIndexOf('__') + 2) : tool

      return say(tool.startsWith('mcp__') ? '조사' : '지휘', t(`${short} 쓰는 중`, `Using ${short}`), t(`${short} 씀`, `Used ${short}`))
    }
  }
}
