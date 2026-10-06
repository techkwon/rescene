import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Cast, Line, Live, MemberId, Role, Said, Task, Tokens, Usage } from '../types'

import { actionOf } from './action'

import type { Moment, WorkRole } from './members'
import { CAST, castOf, isActive, isSameCast, LEADER, lineOf, MEMBERS, MOMENTS, ORDER, pickMember, recast, roleIn, roleOfAgent, roleOfRun, say } from './members'
import { cheerOf, FRAME_MS, frameOf, iconOf } from './sprites'
import { findFleetRuns, isDetached, isPlainLaunch, readMeta, voicedSpecPath } from './orca'
import type { Scene } from './view'
import { backstageLines, castLines, densityOf, drawBand, drawPane, moversOf, plus, rosterLines, shownTask, spoken, usageLines, ZERO } from './view'
import { aimBlock, askOf, castBlock, doingOf, firstLine, leaderSection, linesOf, memberBlock, namedMember, orcaBlock, soloBlock } from './voice'

const PANE = 'rescene'
const TICK_MS = 2000
const SLOW_MS = 180_000
const LINGER_MS = 45_000
const KEPT = 40
const FEED_KEPT = 12
const CUP_KEPT = 40
/** How long each stretch of a task's pulse is, and how many are kept. */
const PULSE_MS = 10_000
const PULSE_KEPT = 12
/** How many of a member's steps are kept: what the backstage can list. */
const TRAIL_KEPT = 40
const PEEK_LINES = 40
/** How often a worker's screen is read for what it is on. */
const WATCH_MS = 6000
const PANE_SIZE = { rows: 36, columns: 72 } as const
const LOST_MS = 3_600_000
const MARK = '[리센느 멤버 배정]'
const TYPED = new Set(['composer', 'bridge', 'sdk'])
const STAND_DOWN = '리센느 모드가 꺼졌다. 지금부터는 원이 말투와 멤버 배정 이야기를 쓰지 않고 평소대로 답한다.'

const isOn = atom({ plugin: 'rescene', key: 'isOn' } as const, true)
const tasks = atom({ plugin: 'rescene', key: 'tasks' } as const, [])
const clockNow = atom({ plugin: 'rescene', key: 'now' } as const, 0)
const waveAt = atom({ plugin: 'rescene', key: 'waveAt' } as const, 0)
const leader = atom({ plugin: 'rescene', key: 'leader' } as const, null)
const ticker = atom({ plugin: 'rescene', key: 'ticker' } as const, null)
const isPaneOpen = atom({ plugin: 'rescene', key: 'isPaneOpen' } as const, false)
const usage = atom({ plugin: 'rescene', key: 'usage' } as const, null)
const leaderTokens = atom({ plugin: 'rescene', key: 'leaderTokens' } as const, { fresh: 0, cached: 0, out: 0 })
const briefed = atom({ plugin: 'rescene', key: 'briefed' } as const, 'no')
const isPaneDismissed = atom({ plugin: 'rescene', key: 'isPaneDismissed' } as const, false)
const feed = atom({ plugin: 'rescene', key: 'feed' } as const, [])
const moments = atom({ plugin: 'rescene', key: 'moments' } as const, [])
const cup = atom({ plugin: 'rescene', key: 'cup' } as const, [])
const turn = atom({ plugin: 'rescene', key: 'turn' } as const, null)
const live = atom({ plugin: 'rescene', key: 'live' } as const, {})
const steps = atom({ plugin: 'rescene', key: 'steps' } as const, {})
const focus = atom({ plugin: 'rescene', key: 'focus' } as const, null)
const peek = atom({ plugin: 'rescene', key: 'peek' } as const, null)
const target = atom({ plugin: 'rescene', key: 'target' } as const, null)
const banked = atom({ plugin: 'rescene', key: 'banked' } as const, {})
const isLight = atom({ plugin: 'rescene', key: 'isLight' } as const, false)
const cast = atom({ plugin: 'rescene', key: 'cast' } as const, CAST)
const isCasting = atom({ plugin: 'rescene', key: 'isCasting' } as const, false)
const isRecast = atom({ plugin: 'rescene', key: 'isRecast' } as const, false)
/** The key the cast is kept under between sessions. */
const CAST_KEY = 'cast'

type Engine = EngineInterface
type Draft = Pick<Task, 'id' | 'kind' | 'role' | 'engine' | 'title'> & Pick<Task, 'out' | 'call' | 'brief' | 'live'>

const SPINNER: Record<string, string> = {
  requesting: '원이 큐시트 보는 중',
  thinking: '원이 교통정리 중',
  responding: '원이 멘트 중',
  'tool-input': '원이 작업지시 쓰는 중',
  'tool-use': '원이 지휘 중',
}

const sceneOf = async ($: Engine): Promise<Scene> => {
  const [list, now, wave, led, ticked, used, ledTokens, said, voted, turned, doing, done, shown, peeked, aimed, kept, roles, isSetting] = await Promise.all([
    read($, tasks),
    read($, clockNow),
    read($, waveAt),
    read($, leader),
    read($, ticker),
    read($, usage),
    read($, leaderTokens),
    read($, feed),
    read($, cup),
    read($, turn),
    read($, live),
    read($, steps),
    read($, focus),
    read($, peek),
    read($, target),
    read($, banked),
    read($, cast),
    read($, isCasting),
  ])

  return { tasks: list, now, waveAt: wave, leader: led, ticker: ticked, usage: used, leaderTokens: ledTokens, feed: said, cup: voted, turn: turned, live: doing, steps: done, focus: shown, peek: peeked, target: aimed, banked: kept, cast: roles, isCasting: isSetting }
}

/** Moves the clock the drawings read to this moment. */
const stamp = async ($: Engine): Promise<void> => {
  const now = await $.clock.now()

  await update($, clockNow, () => now)
}

const lastSaidAt = (scene: Pick<Scene, 'leader' | 'ticker'>): number =>
  Math.max(scene.leader?.at ?? 0, scene.ticker?.at ?? 0)

/** Whether there is something to show unasked: work in hand, or a line just said. */
const isLive = (scene: Scene): boolean =>
  scene.turn !== null || scene.tasks.some(isActive) || (lastSaidAt(scene) > 0 && scene.now - lastSaidAt(scene) < LINGER_MS)

/** A member says a line: the band shows it, and the stage log keeps it. */
const speak = async ($: Engine, said: Said): Promise<void> => {
  // Said in a quiet session, it still has its while on the band: the clock runs on for it and then stops.
  quietBeats = 0
  await update($, clockNow, now => Math.max(now, said.at))
  if (said.member === 'woni') await update($, leader, () => said)
  else await update($, ticker, () => said)
  await update($, feed, list => [...list, said].slice(-FEED_KEPT))
  // The 명대사 월드컵: every line said is a vote for it.
  await update($, cup, list => {
    // A line two members say is each one's own: the votes are for her saying it.
    const isSame = (line: Line): boolean => line.member === said.member && line.quote === said.quote
    const voted = list.some(isSame)
      ? list.map(line => (isSame(line) ? { ...line, count: line.count + 1 } : line))
      : [...list, { member: said.member, quote: said.quote, count: 1 }]

    return voted.sort((a, b) => b.count - a.count).slice(0, CUP_KEPT)
  })
}

/**
 * A member says her line for a moment in the session, once: it is said again
 * only after the moment has passed (`pass`) and come round again.
 */
const mark = async ($: Engine, moment: Moment, note: string): Promise<void> => {
  const box = { isNew: false }

  await update($, moments, list => {
    box.isNew = !list.includes(moment)

    return box.isNew ? [...list, moment] : list
  })
  if (!box.isNew) return
  const { member, quote } = MOMENTS[moment]

  await speak($, { member, quote, note, at: await $.clock.now() })
  $.ui.toast(`${MEMBERS[member].heart} ${MEMBERS[member].name} “${quote}” ${note}`)
  dance($)
}

const pass = async ($: Engine, moment: Moment): Promise<void> => {
  if ((await read($, moments)).includes(moment)) await update($, moments, list => list.filter(one => one !== moment))
}

/** The plan's limits and the context, as the moments they are when nearly spent. */
const weigh = async ($: Engine, figures: Usage): Promise<void> => {
  const used = Math.max(0, ...figures.limits.filter(limit => limit.kind !== 'spend_limit').map(limit => limit.percentUsed))
  const full = figures.contextPercent ?? 0

  if (used >= 95) await mark($, 'starved', `한도를 ${Math.round(used)}% 썼어요`)
  else if (used >= 80) await mark($, 'quota', `한도를 ${Math.round(used)}% 썼어요`)
  if (used < 60) {
    await pass($, 'starved')
    await pass($, 'quota')
  }
  if (full >= 80) await mark($, 'heavy', `컨텍스트가 ${Math.round(full)}% 찼어요`)
  else if (full < 50) await pass($, 'heavy')
}

/** Whether the command itself writes the file: a redirect into it, `tee`, `cp` or `mv` onto it. */
export const writes = (command: string, rawPath: string): boolean => {
  const path = rawPath.replace(/^["']|["']$/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return new RegExp(`(?:>{1,2}|\\btee\\s+(?:-a\\s+)?|\\b(?:cp|mv)\\s+\\S+\\s+)\\s*["']?${path}(?=["'\\s;&|)]|$)`).test(command)
}

/** Adds a task and hands it to a member, who says her line for taking it. */
const reserve = async ($: Engine, draft: Draft, wanted?: MemberId): Promise<Task> => {
  const now = await $.clock.now()
  const box: { task: Task; isWaveStart: boolean; crowd: number; dropped: Task[] } = {
    task: { ...draft, member: 'minami', status: 'running', startedAt: now, toolCount: 0, quote: '', note: '' },
    isWaveStart: false,
    crowd: 0,
    dropped: [],
  }

  const roles = await read($, cast)

  await update($, tasks, list => {
    const member = wanted ?? pickMember(draft.role, list, roles)
    const turn = list.filter(task => task.member === member).length

    box.isWaveStart = !list.some(isActive)
    box.crowd = list.filter(one => isActive(one) && one.id !== draft.id).length + 1
    box.task = {
      ...box.task,
      member,
      quote: say(member, 'start', turn, draft.role),
      note: `${draft.role} 시작 · ${draft.title}`,
    }

    // Only what has ended is history to trim: a task at work stays however long the list.
    const all = [...list.filter(task => task.id !== draft.id), box.task]
    const ended = all.filter(task => !isActive(task))

    box.dropped = ended.slice(0, Math.max(0, ended.length - KEPT))

    return box.dropped.length === 0 ? all : all.filter(task => !box.dropped.includes(task))
  })
  await bank($, box.dropped)

  const { task } = box

  if (box.isWaveStart) {
    await update($, waveAt, () => now)
    await speak($, { member: 'woni', quote: LEADER.wave, note: '멤버들에게 일을 맡기는 중', at: now })
  }
  await speak($, { member: task.member, quote: task.quote, note: task.note, at: now + 1 })
  dance($)
  if (box.crowd >= CROWD) await mark($, 'crowd', `${box.crowd}개 작업이 한꺼번에 돌아가요`).catch(() => undefined)
  await update($, clockNow, () => now)
  if (box.isWaveStart && isAutoOpening && !(await read($, isPaneOpen)) && !(await read($, isPaneDismissed))) {
    // Unasked, so the surface seats it only where there is width to spare;
    // where it does not, the band above the prompt carries the stage.
    void $.ui.open({ id: PANE, title: 'RESCENE', closeOnEscape: true, ...PANE_SIZE }).then(
      opened => {
        isSeatWaited = !opened.isPlaced

        return opened.isPlaced ? update($, isPaneOpen, () => true) : undefined
      },
      () => undefined,
    )
  }

  return task
}

/** Keeps what tasks leaving the list cost, so a member's total never shrinks. */
const bank = async ($: Engine, gone: readonly Task[]): Promise<void> => {
  const spent = gone.filter(task => task.tokens !== undefined)

  if (spent.length === 0) return
  await update($, banked, kept => {
    const next = { ...kept }

    for (const task of spent) next[task.member] = plus(next[task.member] ?? ZERO, task.tokens)

    return next
  })
}

const drop = ($: Engine, id: string): Promise<unknown> => update($, tasks, list => list.filter(task => task.id !== id))

/**
 * Ends a task: the member says how it went, and 원이 sums up a finished wave.
 *
 * `isGuess` is an ending nobody reported (the engine no longer lists the
 * agent): what is reported later overrules it. An Orca worker's meta file is
 * its whole count, so it is taken once; an agent's turns each add theirs.
 */
const settle = async ($: Engine, id: string, isOk: boolean, why: string, tokens?: Tokens, report = '', isGuess = false): Promise<void> => {
  const now = await $.clock.now()
  const box: { ended?: Task; all: Task[] } = { all: [] }

  await update($, tasks, list => {
    box.ended = undefined
    box.all = list.map(task => {
      if (task.id !== id) return task
      const isRevised = !isActive(task) && task.isGuessed === true && !isGuess

      if (!isActive(task) && !isRevised) {
        const counted = task.kind === 'orca' ? (task.tokens ?? tokens) : tokens === undefined ? task.tokens : plus(task.tokens ?? ZERO, tokens)

        return {
          ...task,
          ...(counted === undefined ? {} : { tokens: counted }),
          ...(task.report === undefined && report !== '' ? { report } : {}),
        }
      }
      const { tool: _tool, detail: _detail, isGuessed: _isGuessed, ...rest } = task
      const endedAt = task.endedAt ?? now
      const took = spoken(endedAt - task.startedAt)
      const ended: Task = {
        ...rest,
        status: isOk ? 'done' : 'failed',
        endedAt,
        quote: say(task.member, isOk ? 'done' : 'fail', task.toolCount + task.title.length, task.role),
        note: [`${task.role} ${isOk ? '끝' : '실패'}`, took, why].filter(part => part !== '').join(' · '),
        ...(tokens === undefined ? {} : { tokens: plus(task.tokens ?? ZERO, tokens) }),
        ...(report === '' ? {} : { report }),
        ...(isGuess ? { isGuessed: true } : {}),
      }

      // A guess that turned out right has been said already; one that was wrong is said again.
      if (!isRevised || (task.status === 'done') !== isOk) box.ended = ended

      return ended
    })

    return box.all
  })

  const { ended } = box

  // Ended after the mode went off: counted, and nothing said or shown of it.
  if (ended === undefined || !isLit) return
  const member = MEMBERS[ended.member]

  await speak($, { member: ended.member, quote: ended.quote, note: ended.note, at: now })
  if (isOk) cheers[ended.member] = beat + CHEER_BEATS
  dance($)
  $.ui.toast(`${member.heart} ${member.name} “${ended.quote}” ${ended.note}`)

  if (!box.all.some(isActive)) {
    const since = await read($, waveAt)
    const wave = box.all.filter(task => task.startedAt >= since)
    const failed = wave.filter(task => task.status === 'failed').length
    await pass($, 'crowd').catch(() => undefined)
    const quote = failed > 0 ? say('woni', 'fail', wave.length + failed, '지휘') : wave.length >= 2 ? LEADER.sweep : LEADER.tasty
    const note = failed > 0 ? `${wave.length}개 가운데 ${failed}개 실패` : `${wave.length}개 작업 끝`

    await speak($, { member: 'woni', quote, note, at: now + 1 })
    if (wave.length >= 2) $.ui.toast(`${MEMBERS.woni.heart} 원이 “${quote}” ${note}`)
  }
  await update($, clockNow, () => now + 1)
}

/** Gives a subagent's task the id its loop's events carry. */
const adopt = async ($: Engine, agentId: string): Promise<void> => {
  const list = await read($, tasks)

  if (list.some(task => task.id === agentId)) return
  const waiting = list.filter(task => task.kind === 'agent' && task.id.startsWith('spawn:') && isActive(task))

  if (waiting.length === 0) return
  const info = (await $.agent.list().catch(() => [])).find(agent => agent.id === agentId)
  const match =
    waiting.find(task => info !== undefined && info.description.endsWith(task.title) && info.type === task.engine) ??
    (waiting.length === 1 ? waiting[0] : undefined)

  if (match === undefined) return
  await update($, tasks, now => now.map(task => (task.id === match.id ? { ...task, id: agentId } : task)))
}

/** Notes the tool a member's loop is on; a finished member who works again is back on stage. */
const touch = async ($: Engine, agentId: string, tool: string, detail: string, past: string, call: string): Promise<void> => {
  await adopt($, agentId)
  if (!(await read($, tasks)).some(task => task.id === agentId)) return
  const at = await $.clock.now()

  await update($, tasks, list =>
    list.map(task => {
      if (task.id !== agentId) return task
      const { endedAt: _endedAt, ...rest } = task
      // One more call in the stretch of time this one falls in; the stretches skipped were quiet.
      const pulseAt = Math.max(0, Math.floor((at - task.startedAt) / PULSE_MS))
      const quiet = Math.max(0, pulseAt - (task.pulseAt ?? pulseAt))
      const beats = [...(task.pulse ?? [0]), ...Array.from({ length: quiet }, () => 0)]
      const pulse = [...beats.slice(0, -1), (beats.at(-1) ?? 0) + 1].slice(-PULSE_KEPT)
      const trail = [...(task.trail ?? []), { at, text: past, call }].slice(-TRAIL_KEPT)
      const next = { tool, detail, toolCount: task.toolCount + 1, pulse, pulseAt, trail }

      return isActive(task) ? { ...task, ...next } : { ...rest, status: 'running' as const, ...next }
    }),
  )
}

/** A member's call was refused or failed: her record says so instead of saying it was done. */
const amend = async ($: Engine, agentId: string, call: string, how: '거절됨' | '실패'): Promise<void> => {
  await update($, tasks, list =>
    list.map(task =>
      task.id !== agentId || task.trail?.some(step => step.call === call) !== true
        ? task
        : { ...task, trail: task.trail.map(step => (step.call !== call ? step : { ...step, text: `${how}: ${step.text.includes(': ') ? step.text.slice(step.text.indexOf(': ') + 2) : step.text}` })) },
    ),
  )
}

const tokensOf = (spent: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }): Tokens => ({
  fresh: spent.input_tokens + spent.cache_creation_input_tokens,
  cached: spent.cache_read_input_tokens,
  out: spent.output_tokens,
})

type Figures = Pick<Awaited<ReturnType<Engine['session']['usage']>>, 'context' | 'rateLimits' | 'cost'>

/** Takes the session's figures, read or pushed; writes them only when one moved. */
const takeUsage = async ($: Engine, figures: Figures): Promise<void> => {
  const next: Usage = {
    contextWindow: figures.context.window,
    limits: figures.rateLimits.map(limit => {
      const resetsAt = limit.resetsAt === undefined ? Number.NaN : Date.parse(limit.resetsAt)

      return { kind: limit.kind, percentUsed: limit.percentUsed, ...(Number.isNaN(resetsAt) ? {} : { resetsAt }) }
    }),
    ...(figures.context.percent === undefined ? {} : { contextPercent: figures.context.percent }),
    ...(figures.context.tokens === undefined ? {} : { contextTokens: figures.context.tokens }),
    ...(figures.cost === undefined ? {} : { usd: figures.cost.usd }),
  }

  if (JSON.stringify(next) === JSON.stringify(await read($, usage))) return
  await update($, usage, () => next)
  if (await read($, isOn)) await weigh($, next).catch(() => undefined)
}

const refreshUsage = async ($: Engine): Promise<void> => takeUsage($, await $.session.usage())

/** A report longer than this is not read for its first line. */
const REPORT_BYTES = 512_000

/** Ends an Orca worker whose `<out>.meta.json` has landed since it started. */
const pollWorker = async ($: Engine, task: Task): Promise<void> => {
  if (task.out === undefined) return
  const path = `${task.out}.meta.json`
  const stat = await $.fs.stat(path).catch(() => undefined)

  // Its own meta file: newer than the one the path held when the worker was launched.
  if (stat === undefined || stat.mtimeMs <= (task.metaAt ?? task.startedAt - 1000)) return
  const meta = readMeta(await $.fs.read(path).catch(() => ''))

  if (meta === undefined) return
  const size = (await $.fs.stat(task.out).catch(() => undefined))?.size ?? 0
  const report = size > REPORT_BYTES ? '' : firstLine(await $.fs.read(task.out).catch(() => ''))

  await settle($, task.id, meta.isOk, meta.note, meta.tokens, report)
}

/** What a shell command printed, where its result says. */
const printed = (ran: object): string => {
  const result = (ran as { result?: unknown }).result
  const out = typeof result === 'object' && result !== null ? (result as { stdout?: unknown }).stdout : undefined

  return typeof out === 'string' ? out : ''
}

/** What of a command stands outside its quotes. */
const bareOf = (command: string): string => command.trim().replace(/"[^"]*"|'[^']*'/g, '')

/**
 * The command is the opening of one Orca terminal that runs the launch, and nothing else: no step
 * before or after, nothing run at once, no output sent elsewhere. What it prints is then that
 * terminal's answer, whole or picked out by a filter it is piped to (`| grep -o …`).
 */
const isTerminalAlone = (command: string): boolean => {
  const bare = bareOf(command)
  const [first = '', ...filters] = bare.split('|')

  return (
    (command.match(/\borca\s+terminal\s+create\b/g) ?? []).length === 1 &&
    /^\s*(?:\S*\/)?orca\s+terminal\s+create\b/.test(first) &&
    /\borca\s+terminal\s+create\b(?:"[^"]*"|'[^']*'|[^;&|\n"'])*?\s--command\s+(["'])(?:(?!\1)[^\n])*\bfleet-run\b/.test(command) &&
    !/[;&<>\n`]|\$\(/.test(bare) &&
    filters.every(filter => /^\s*(?:grep|jq|head|tail|cat|tee|sed|awk|cut|tr)\b/.test(filter))
  )
}

/** The handle such a command printed: the one it names, and none where it names two or says it failed. */
const termOf = (text: string): string | undefined => {
  const handles = [...new Set([...text.matchAll(/"handle"\s*:\s*"(term_[\w-]+)"/g)].map(found => found[1]))]

  return handles.length === 1 && !/"ok"\s*:\s*false/.test(text) ? handles[0] : undefined
}

/** Points one `--spec <file>` of a command at another file, leaving the file's other mentions. */
const swapSpec = (command: string, raw: string, path: string): string => {
  for (const joint of [' ', '=']) {
    const at = command.indexOf(`--spec${joint}${raw}`)

    if (at >= 0) return `${command.slice(0, at)}--spec${joint}${path}${command.slice(at + 7 + raw.length)}`
  }

  return command
}

// The icons move while their member works: each beat repaints the cells in
// place (`$.ui.blit`), with no redraw and nothing written to state.
const CROWD = 4
/** Reads of one file in a turn before 원이 says they keep meeting. */
const MET_AGAIN = 5
const CHEER_BEATS = 12
const REST_BEATS = 25

let dancer: Timer | undefined
let beat = 0
let restBeats = 0
/** Whether the pane is drawn with its icons, as the last drawing of it had it. */
let isStaged = false
/** The members at work, as the last drawing of the pane had them. */
let moving: readonly MemberId[] = []
/** The members whose icon is off its still pose. */
let posed: readonly MemberId[] = []
/** The members whose icon the pane draws: all five, or the one whose backstage it shows. */
let iconed: readonly MemberId[] = ORDER
/** The theme the pane was last drawn in: the moving icons are painted in its colors. */
let isLightDrawn = false
/** The beat each member hops until, for a task of hers that ended well. */
const cheers: { [id in MemberId]?: number } = {}

const stepIcons = async ($: Engine): Promise<void> => {
  beat += 1
  const cheering = ORDER.filter(id => (cheers[id] ?? 0) > beat)
  const now = isStaged ? iconed.filter(id => moving.includes(id) || cheering.includes(id)) : []
  const left = isStaged ? posed.filter(id => !now.includes(id) && iconed.includes(id)) : []

  posed = now
  if (now.length === 0 && left.length === 0) {
    restBeats += 1
    if (restBeats > REST_BEATS) {
      dancer?.cancel()
      dancer = undefined
    }

    return
  }
  restBeats = 0
  const painted = await Promise.all([
    ...now.map(id => $.ui.blit({ requestId: PANE, key: `icon-${id}`, cells: cheering.includes(id) ? cheerOf(id, beat, isLightDrawn) : frameOf(id, beat, isLightDrawn) })),
    ...left.map(id => $.ui.blit({ requestId: PANE, key: `icon-${id}`, cells: iconOf(id, isLightDrawn) })),
  ])

  // Not drawn any more (closed, or drawn without icons): the next drawing says so again.
  if (painted.some(one => one.deny !== undefined)) isStaged = false
}

/** Starts the beat the icons move to; it stops by itself once nobody has moved for a while. */
const dance = ($: Engine): void => {
  restBeats = 0
  dancer ??= $.clock.every(FRAME_MS, () => void stepIcons($).catch(() => undefined))
}

let isTicking = false
let isAutoOpening = true
/** How often the main session has read each file this turn. */
const reads = new Map<string, number>()
/** The prompt typed last, until the turn it opens takes it as what was asked. */
/** Whether the mode is on, as the last command or start left it: what a hook under way since before reads. */
let isLit = true
/** How many times the roles have been changed: what a prompt on its way compares, once it has entered. */
let recasts = 0
/** How many times the mode was turned on or off by command: a start that began before one does not speak for it. */
let flips = 0
let asked = ''
/** Whom that prompt was for, where the person had named a member. */
let askedTo: MemberId | null = null
/** The pane was opened unasked and waits for the terminal to widen. */
let isSeatWaited = false

/**
 * Drops the ended Orca tasks whose worker left no meta file: a worker that
 * ran writes one, so these were a command that only spoke of a launch.
 */
const sweep = async ($: Engine): Promise<void> => {
  const ghosts: string[] = []

  for (const task of await read($, tasks)) {
    if (task.kind !== 'orca' || isActive(task) || task.tokens !== undefined || task.engine === '시연') continue
    const isRun = task.out !== undefined && (await $.fs.exists(`${task.out}.meta.json`).catch(() => false))

    if (!isRun) ghosts.push(task.id)
  }
  if (ghosts.length > 0) await update($, tasks, list => list.filter(task => !ghosts.includes(task.id)))
}

/** The theme the mod was told to draw for; `auto` follows the engine's own. */
let palette = 'auto'

/** Whether the theme by that name is a light one: `light`, `light-daltonized`, `light-ansi`. */
const isLightNamed = (name: unknown): boolean => typeof name === 'string' && /light/i.test(name)

/** Sets the colors to the terminal's theme: the mod's own setting, else the engine's theme by its name. */
const readTheme = async ($: Engine, named?: unknown): Promise<void> => {
  const theme = palette !== 'auto' ? palette : (named ?? (await $.config.list().catch(() => [])).find(row => row.key === 'theme')?.value)
  const light = isLightNamed(theme)

  if (light !== (await read($, isLight))) await update($, isLight, () => light)
}

const ORCA = ['orca', '/Applications/Orca.app/Contents/Resources/bin/orca'] as const
/** The `orca` that started, once one has. */
let orcaAt: string | undefined

/**
 * An Orca worker's screen as it runs: the file its launch keeps it in, or
 * the Orca terminal it was launched in, read through the `orca` command.
 */
/** A worker's screen as it was last read: the text, when, how many readings in a row have failed since, and whether one ever held. */
type Seen = { at: number; text: string; fails: number; isRead: boolean }

/**
 * Reads a worker's screen: nothing where it could not be read, which is not an empty screen.
 * A file that is not there yet is an empty screen until it has been read once; after, it is a failure.
 */
const readScreen = async ($: Engine, task: Task, wasRead: boolean): Promise<string | undefined> => {
  if (task.live !== undefined) {
    const kept = await $.fs.stat(task.live).catch(() => undefined)

    if (kept === undefined) return wasRead ? undefined : ''
    if (kept.size === 0) return ''
    if (kept.size <= REPORT_BYTES) return await $.fs.read(task.live).catch(() => undefined)
    // Too long to read whole: its end, which is what is asked of it.
    const end = await $.process.run(['tail', '-c', '16000', task.live], { timeoutMs: 5000 }).catch(() => undefined)

    return end === undefined || end.exitCode !== 0 ? undefined : end.stdout
  }
  if (task.term === undefined) return ''
  // The command by its name, and where the app keeps it for a session whose path does not have it.
  for (const orca of orcaAt === undefined ? ORCA : [orcaAt]) {
    const read = await $.process.run([orca, 'terminal', 'read', '--terminal', task.term, '--screen'], { timeoutMs: 5000 }).catch(() => undefined)

    if (read === undefined) continue
    orcaAt = orca

    return read.exitCode === 0 ? read.stdout : undefined
  }

  return undefined
}

/** Each launch's screen as last read, and the reading under way: the card and the backstage ask for the same one. */
const screens = new Map<string, Seen>()
const reading = new Map<string, Promise<Seen>>()

/** One launch's screen and no other's: a task of the same name started again, or shown elsewhere, is another. */
const screenKey = (task: Task): string => `${task.id}\n${task.startedAt}\n${task.term ?? task.live ?? ''}`

/** Puts away the screens of launches that no longer run. */
const forget = (running: readonly Task[]): void => {
  const kept = new Set(running.map(screenKey))

  for (const key of screens.keys()) if (!kept.has(key)) screens.delete(key)
  for (const key of reading.keys()) if (!kept.has(key)) reading.delete(key)
}

/**
 * A worker's screen, read once a while whoever asks; one that cannot be read is asked for less
 * and less often, up to once a minute, and keeps the text it had with how often it has failed.
 */
const screenOf = async ($: Engine, task: Task, now: number): Promise<Seen> => {
  const key = screenKey(task)
  const seen = screens.get(key)

  if (seen !== undefined && now - seen.at < WATCH_MS * Math.min(2 ** seen.fails, 10)) return seen
  const under = reading.get(key)

  if (under !== undefined) return under
  const next = readScreen($, task, seen?.isRead === true)
    .catch(() => undefined)
    .then(text => {
      const read: Seen = text === undefined ? { at: now, text: seen?.text ?? '', fails: (seen?.fails ?? 0) + 1, isRead: seen?.isRead === true } : { at: now, text, fails: 0, isRead: seen?.isRead === true || text !== '' }

      // Put away since it was asked for: its launch has ended, and the answer is nobody's.
      if (reading.get(key) === next) {
        screens.set(key, read)
        reading.delete(key)
      }

      return read
    })

  reading.set(key, next)

  return next
}

/** How many readings in a row may fail before what the card says she is on is taken off it. */
const STALE_FAILS = 2

/** Puts what a running worker's screen says it is on onto her card, every while. */
const watch = async ($: Engine, task: Task, now: number): Promise<void> => {
  if (task.status !== 'running' || (task.live === undefined && task.term === undefined)) return
  const seen = await screenOf($, task, now)
  const doing = seen.fails === 0 ? doingOf(linesOf(seen.text, PEEK_LINES, 'tail')) : ''

  if (seen.fails >= STALE_FAILS && task.detail !== undefined) {
    // Not read for a while: what it was on then is not what it is on now.
    await update($, tasks, list => list.map(one => (one.id !== task.id || !isActive(one) ? one : (({ detail: _detail, ...rest }) => rest)(one))))

    return
  }
  if (doing === '' || doing === task.detail) return
  await update($, tasks, list => list.map(one => (one.id === task.id && isActive(one) ? { ...one, detail: doing } : one)))
}

/** Reads what the backstage shows of an Orca worker: its screen while it runs, its report once it has ended. */
const peekAt = async ($: Engine): Promise<void> => {
  const who = await read($, focus)
  const task = who === null ? undefined : shownTask(await read($, tasks), who)
  const shown = await read($, peek)
  const isRunning = task !== undefined && isActive(task)

  if (task === undefined || task.kind !== 'orca' || (isRunning ? task.live === undefined && task.term === undefined : task.out === undefined)) {
    if (shown !== null) await update($, peek, () => null)

    return
  }
  const size = isRunning || task.out === undefined ? 0 : ((await $.fs.stat(task.out).catch(() => undefined))?.size ?? 0)
  // Only a launch that runs is read anew; one waited for with no word shows what was last read of it.
  const seen = !isRunning ? undefined : task.status === 'running' ? await screenOf($, task, await $.clock.now()) : (screens.get(screenKey(task)) ?? { at: 0, text: '', fails: 1, isRead: false })
  const text = seen !== undefined ? seen.text : task.out === undefined || size === 0 || size > REPORT_BYTES ? '' : await $.fs.read(task.out).catch(() => '')
  const lines = linesOf(text, PEEK_LINES, isRunning ? 'tail' : 'head')
  const isStale = seen !== undefined && seen.fails > 0

  if (shown?.id === task.id && shown.lines.join('\n') === lines.join('\n') && (shown.isStale === true) === isStale) return
  await update($, peek, () => ({ id: task.id, lines, ...(isStale ? { isStale } : {}) }))
}

/** Opens a member's backstage in the pane, or goes back to the five cards: her again, or nobody. */
const pick = async ($: Engine, id: MemberId | null): Promise<void> => {
  await update($, isCasting, () => false)
  await update($, focus, now => (id === null || now === id ? null : id))
  await peekAt($).catch(() => undefined)
  await stamp($)
  dance($)
}

/** Names the member the person's next prompts go to; 원이, or her again, is nobody named. */
const aim = async ($: Engine, id: MemberId | null): Promise<void> => {
  await update($, target, now => (id === null || now === id ? null : id))
}

/** Commands that set the session up and ask nothing of the model: what follows them is not work for a member. */
const LOCAL = new Set([
  'rescene', 'model', 'permissions', 'compact', 'config', 'clear', 'add-dir', 'mcp', 'plugin', 'plugins', 'resume', 'rename', 'effort', 'theme', 'output-style',
  'memory', 'login', 'logout', 'agents', 'hooks', 'fast', 'vim', 'voice', 'cost', 'context', 'export', 'status', 'help', 'doctor', 'ide', 'terminal-setup',
  'privacy-settings', 'release-notes', 'upgrade', 'usage', 'bug', 'feedback', 'exit', 'quit', 'rewind', 'color', 'skills', 'tasks', 'todos', 'buddy', 'workflows', 'artifacts',
  'sandbox', 'bashes', 'keybindings', 'reload-plugins', 'remote-control', 'mobile', 'desktop', 'chrome', 'passes', 'stickers', 'extra-usage', 'install-github-app',
])

const UNKEPT = '역할은 바뀌었지만 저장하지 못했어요. 이 세션에만 적용됩니다.'

/**
 * Gives a kind of work to a member, who had it taking hers in exchange;
 * nobody named, every member has her own again (자동). Kept between
 * sessions, and the main loop is told with the next prompt.
 */
const giveRole = async ($: Engine, id: MemberId | null, role: WorkRole): Promise<{ cast: Cast; isKept: boolean }> => {
  const had = await read($, cast)
  const next = id === null ? CAST : recast(had, id, role)

  if (isSameCast(had, next)) {
    // Her own position asked for where it already is: whatever a session before kept is put away all the same.
    if (id !== null) return { cast: had, isKept: true }
    // Written as this session's own, so a reload does not go back to what was kept.
    await $.state.set({ plugin: 'rescene', key: 'cast' } as const, { ...CAST })

    return { cast: had, isKept: await $.store.delete(CAST_KEY).then(() => true, () => false) }
  }
  await update($, cast, () => next)
  await update($, isRecast, () => true)
  recasts += 1
  // Her own position is what there is with nothing kept.
  const isKept = await (isSameCast(next, CAST) ? $.store.delete(CAST_KEY) : $.store.set(CAST_KEY, next)).then(() => true, () => false)

  if (!isKept) $.ui.toast(UNKEPT)
  $.ui.invalidate('prompt.section')
  if (id !== null && (await read($, isOn))) {
    const at = await $.clock.now()

    await speak($, { member: id, quote: say(id, 'start', at, role), note: `이제부터 ${role} 담당`, at })
  }

  return { cast: next, isKept }
}

/** Opens the pane on the screen the roles are set on, or goes back from it to the five cards. */
const setup = async ($: Engine, isOpen: boolean): Promise<void> => {
  await update($, isCasting, () => isOpen)
  if (isOpen) {
    await update($, focus, () => null)
    const opened = await $.ui.open({ id: PANE, title: 'RESCENE', closeOnEscape: true, ...PANE_SIZE })

    isSeatWaited = !opened.isPlaced
    await update($, isPaneOpen, () => opened.isPlaced)
    await update($, isPaneDismissed, () => false)
  }
  await stamp($)
  dance($)
}

const ROLE_NAMED: Record<string, WorkRole> = { 구현: '구현', build: '구현', 검토: '검토', review: '검토', 조사: '조사', research: '조사', 탐색: '탐색', explore: '탐색' }

const NAMED: Record<string, MemberId> = {
  원이: 'woni',
  woni: 'woni',
  리브: 'liv',
  liv: 'liv',
  미나미: 'minami',
  minami: 'minami',
  메이: 'may',
  may: 'may',
  제나: 'zena',
  zena: 'zena',
}

/** A pane that waited for width and has since been seated: the band gives way to it. */
const seat = async ($: Engine): Promise<void> => {
  if (!isSeatWaited) return
  const isUp = (await $.ui.panes().catch(() => [])).some(pane => pane.id === PANE && pane.isPlaced)

  if (!isUp) return
  isSeatWaited = false
  await update($, isPaneOpen, () => true)
}
let quietBeats = 0

/** One beat: asks after every member at work, and moves the clock the drawings read. */
const tick = async ($: Engine): Promise<void> => {
  if (isTicking) return
  isTicking = true
  try {
    if (!(await read($, isOn))) return
    await seat($)
    if ((await read($, focus)) !== null) await peekAt($).catch(() => undefined)
    const active = (await read($, tasks)).filter(isActive)

    if (active.length === 0 && screens.size + reading.size > 0) forget([])
    if (active.length === 0 && (await read($, turn)) !== null) {
      quietBeats = 0
      if (isStaged) dance($)
      await stamp($)

      return
    }
    if (active.length === 0) {
      // The clock runs on until the last line said has aged out and the band
      // has left; after that a quiet session costs two reads a beat.
      quietBeats += 1
      if (quietBeats * TICK_MS <= LINGER_MS + 2 * TICK_MS) await stamp($)

      return
    }
    quietBeats = 0
    if (isStaged) dance($)
    const now = await $.clock.now()

    // A list that could not be read says nothing of who has ended: the agents are left as they are this beat.
    const agents = active.some(task => task.kind === 'agent') ? await $.agent.list().catch(() => undefined) : []
    // Every agent a task already has, ended ones too: a new task of the same name takes another.
    const held = new Set((await read($, tasks)).map(one => one.id))

    await Promise.all(active.filter(task => task.kind === 'orca').map(task => pollWorker($, task).catch(() => undefined)))
    await Promise.all(active.filter(task => task.kind === 'orca').map(task => watch($, task, now).catch(() => undefined)))
    forget(active.filter(task => task.status === 'running'))
    for (const task of active) {
      if (task.kind === 'orca') {
        // Launched where its result could not be followed: after an hour it is off the stage, its ending a guess.
        if (task.out === undefined && now - task.startedAt > LOST_MS) await settle($, task.id, true, '결과는 직접 확인', undefined, '', true)
        if (task.out !== undefined && task.status === 'running' && now - task.startedAt > LOST_MS) {
          const note = '한 시간이 넘도록 결과 파일이 안 보여요. 직접 확인해 주세요'

          await update($, tasks, list => list.map(one => (one.id === task.id && isActive(one) ? { ...one, status: 'waiting' as const, note } : one)))
        }
        continue
      }
      if (agents === undefined) continue
      const info = agents.find(agent => agent.id === task.id)

      if (info === undefined) {
        if (task.id.startsWith('spawn:')) {
          // Its spawn answered no id: the list has it under the description
          // the spawn hook gave it.
          const found = agents.find(agent => !held.has(agent.id) && agent.type === task.engine && agent.description.endsWith(task.title))

          if (found !== undefined) {
            // Hers from here on: the next task of the same name takes another.
            held.add(found.id)
            await update($, tasks, list => (list.some(one => one.id === found.id) ? list : list.map(one => (one.id === task.id ? { ...one, id: found.id } : one))))
          }
        } else if (now - task.startedAt > 30_000) {
          // The engine lists an agent until it drops its task: one it no longer
          // lists has ended, and its turn's end did not reach this hook.
          await settle($, task.id, true, '결과는 직접 확인', undefined, '', true)
        }
        continue
      }
      if (info.status === 'completed') await settle($, task.id, true, '')
      else if (info.status === 'failed' || info.status === 'killed') await settle($, task.id, false, info.status === 'killed' ? '중단됨' : '')
      else if ((info.status === 'waiting') !== (task.status === 'waiting')) {
        const status = info.status === 'waiting' ? ('waiting' as const) : ('running' as const)

        await update($, tasks, list => list.map(one => (one.id === task.id && isActive(one) ? { ...one, status } : one)))
      }
    }

    for (const task of active) {
      if (task.isSlow === true || now - task.startedAt < SLOW_MS) continue
      const quote = say(task.member, 'slow', task.toolCount + task.title.length, task.role)
      const note = `${task.role} 계속하는 중 · ${spoken(now - task.startedAt)} 지남`

      const box = { isSlowed: false }

      await update($, tasks, list =>
        list.map(one => {
          // One that ended earlier this beat has nothing left to be slow at.
          if (one.id !== task.id || !isActive(one) || one.isSlow === true) return one
          box.isSlowed = true

          return { ...one, isSlow: true, quote, note }
        }),
      )
      if (!box.isSlowed) continue
      await speak($, { member: task.member, quote, note, at: now })
      if (task.member === 'zena') {
        await pass($, 'dawdle')
        await mark($, 'dawdle', `제나가 ${spoken(now - task.startedAt)}째 ${task.role} 중`)
      }
    }

    await update($, clockNow, () => now)
  } finally {
    isTicking = false
  }
}

const DEMO: readonly (readonly [Role, string, number, boolean])[] = [
  ['구현', '시연: 로그인 화면 고치기', 9000, true],
  ['검토', '시연: 바뀐 코드 다시 보기', 13_000, true],
  ['조사', '시연: 최신 문서 찾아 정리', 6000, true],
  ['탐색', '시연: 설정 파일 위치 찾기', 4000, false],
]

let timer: Timer | undefined

export const register: Register = (on, options) => {
  const isLeaderVoiced = options.leaderVoice !== false
  const isMemberVoiced = options.memberVoice !== false
  const isOrcaVoiced = options.orcaVoice !== false
  const isBandShown = options.band !== false
  const isBandFull = options.bandStyle !== 'compact'
  const isScreenKept = options.keepScreen === true

  isAutoOpening = options.autoOpen !== false
  palette = options.theme === 'dark' || options.theme === 'light' ? options.theme : 'auto'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'rescene',
      description: '리센느 모드: 멤버 현황 패널을 열거나 켜고 끈다',
      argumentHint: '[on|off|usage|cup|clear|demo|<멤버>|all|to <멤버|자동>|role [<멤버> <역할>|auto]]',
      immediate: true,
    })
    const flipped = flips

    // Calls open with no turn under way are of a module that is gone, and have ended; with one under
    // way they may still be running, and are closed by their own end or the turn's.
    if ((await read($, turn)) === null) await update($, live, now => Object.fromEntries(Object.entries(now).map(([id, one]) => [id, { ...one, running: 0, open: [] }])))
    await sweep($).catch(() => undefined)
    const mine = (await $.ui.panes().catch(() => [])).find(pane => pane.id === PANE)

    isSeatWaited = mine !== undefined && !mine.isPlaced
    await update($, isPaneOpen, () => mine?.isPlaced === true)
    await readTheme($).catch(() => undefined)
    // The roles the person set in a session before this one.
    // Only a session that has no cast of its own yet: one set since, kept or not, is not gone back on by a reload.
    if ((await $.state.get({ plugin: 'rescene', key: 'cast' } as const)).version === 0) {
      const kept = castOf(await $.store.get(CAST_KEY).catch(() => undefined))

      if (!isSameCast(kept, CAST)) await update($, cast, () => kept)
    }
    const lit = await read($, isOn)

    // Read as of the start: a command given since, while this waited, has the last word.
    if (flips === flipped) isLit = lit
    await refreshUsage($).catch(() => undefined)
    timer?.cancel()
    timer = $.clock.every(TICK_MS, () => void tick($).catch(() => undefined))

    return next(e)
  })

  on('command.run', { command: 'rescene' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()

    await readTheme($).catch(() => undefined)

    if (asked === 'on' || asked === 'off') {
      await update($, isOn, () => asked === 'on')
      isLit = asked === 'on'
      flips += 1
      await update($, briefed, told => (asked === 'off' ? (told === 'yes' ? 'undo' : told) : told === 'undo' ? 'yes' : told))
      if (asked === 'off') {
        await update($, turn, () => null)
        await update($, live, () => ({}))
      }
      $.ui.invalidate('prompt.section')

      return { text: asked === 'on' ? `${MEMBERS.woni.heart} 원이 “${LEADER.wave}” 리센느 모드를 켰어요.` : `${MEMBERS.woni.heart} 원이 “애기 자께예~♡” 리센느 모드를 껐어요. /rescene on 으로 다시 켭니다.` }
    }
    if (asked === 'usage') {
      await refreshUsage($).catch(() => undefined)
      await stamp($)

      return { text: ['RESCENE 사용량', ...usageLines(await sceneOf($))].join('\n') }
    }
    if (asked === 'clear') {
      // What the ended tasks cost stays counted: only the history is cleared.
      // A worker whose result cannot be followed never ends by itself: clearing lets go of it too.
      const isKept = (task: Task): boolean => isActive(task) && !(task.kind === 'orca' && task.out === undefined && task.status === 'waiting')

      await bank($, (await read($, tasks)).filter(task => !isKept(task)))
      await update($, tasks, list => list.filter(isKept))
      await update($, steps, () => ({}))
      await update($, peek, () => null)
      await update($, leader, () => null)
      await update($, ticker, () => null)
      await update($, feed, () => [])
      await update($, cup, () => [])

      return { text: '끝난 작업 기록을 지웠어요.' }
    }
    if (asked === 'cup') {
      const ranked = (await read($, cup)).slice(0, 8)
      const rows = ranked.map((line, index) => `${index + 1}위 ${MEMBERS[line.member].heart} ${MEMBERS[line.member].name} “${line.quote}” ${line.count}번`)

      return { text: ['명대사 월드컵 (이 세션에서 많이 나온 대사)', ...(rows.length === 0 ? ['아직 나온 대사가 없어요.'] : rows)].join('\n') }
    }
    if (asked === 'demo') {
      for (const [index, [role, title, ms, isOk]] of DEMO.entries()) {
        const task = await reserve($, { id: `orca:demo:${index}`, kind: 'orca', role, engine: '시연', title })

        $.clock.after(ms, () => void settle($, task.id, isOk, '시연', undefined, isOk ? `시연이라 실제로 한 일은 없어요 (${title.slice(4)})` : '').catch(() => undefined))
      }

      return { text: '시연을 시작했어요. 실제 작업이 아니라 화면을 보여 주는 가짜 작업 4개가 15초쯤 돌아갑니다.' }
    }

    if (asked === 'to' || asked.startsWith('to ')) {
      const who = asked.slice(2).trim()

      if (who === 'auto' || who === '자동') {
        await update($, target, () => null)

        return { text: '자동으로 돌렸어요. 원이가 알아서 일을 나눠 맡깁니다.' }
      }
      const named = NAMED[who]

      if (named === undefined) return { text: '받을 멤버를 적어 주세요: /rescene to 자동 · 원이(직접 처리) · 리브 · 미나미 · 메이 · 제나' }
      await update($, target, () => named)

      return { text: named === 'woni' ? `다음 명령부터 ${MEMBERS.woni.heart} 원이가 맡기지 않고 직접 처리합니다. 풀려면 /rescene to 자동` : `다음 명령부터 ${MEMBERS[named].heart} ${MEMBERS[named].name}에게 맡깁니다. 풀려면 /rescene to 자동` }
    }
    if (asked === 'role' || asked === '역할' || asked.startsWith('role ') || asked.startsWith('역할 ')) {
      const [first = '', second = ''] = asked.split(/\s+/).slice(1)
      const how = '바꾸려면 /rescene role 리브 구현 (멤버: 리브·미나미·메이·제나 / 역할: 구현·검토·조사·탐색), 자동으로 돌리려면 /rescene role auto'

      if (first === '') {
        await setup($, true)

        return { text: ['RESCENE 역할 설정', ...castLines(await read($, cast)), how].join('\n') }
      }
      if (first === 'auto' || first === '자동' || first === 'reset' || first === '기본') {
        const given = await giveRole($, null, '구현')

        return { text: ['역할을 자동(기본)으로 돌렸어요.', ...castLines(given.cast), ...(given.isKept ? [] : [UNKEPT])].join('\n') }
      }
      const member = NAMED[first] ?? NAMED[second]
      const role = ROLE_NAMED[second] ?? ROLE_NAMED[first]

      if (member === undefined || member === 'woni' || role === undefined) return { text: member === 'woni' ? `원이는 리더라 지휘를 그대로 맡습니다. ${how}` : how }

      const given = await giveRole($, member, role)

      return { text: [`${MEMBERS[member].heart} ${MEMBERS[member].name}가 이제 ${role} 담당이에요.`, ...castLines(given.cast), ...(given.isKept ? [] : [UNKEPT])].join('\n') }
    }
    const viewed = NAMED[asked]

    if (asked !== '' && asked !== 'all' && viewed === undefined) return { text: '쓸 수 있는 말: on · off · usage · cup · clear · demo · 멤버 이름(활동 보기) · all · to 멤버 이름|자동(지명) · role(역할 설정)' }
    if (asked !== '') await update($, focus, () => viewed ?? null)
    await update($, isCasting, () => false)
    await peekAt($).catch(() => undefined)
    await refreshUsage($).catch(() => undefined)
    await stamp($)
    const opened = await $.ui.open({ id: PANE, title: 'RESCENE', closeOnEscape: true, ...PANE_SIZE })

    // Asked for, so it is seated at any width; where it still is not, the band keeps the stage.
    isSeatWaited = !opened.isPlaced
    await update($, isPaneOpen, () => opened.isPlaced)
    await update($, isPaneDismissed, () => false)
    dance($)
    const scene = await sceneOf($)

    if (scene.focus !== null) return { text: [`${MEMBERS[scene.focus].heart} ${MEMBERS[scene.focus].name} 백스테이지`, ...backstageLines(scene.focus, scene, 24)].join('\n') }

    return { text: ['“이봐협에서 나왔습니다.” RESCENE 멤버 현황 패널을 열었어요.', ...rosterLines(scene)].join('\n') }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    isStaged = false
    isSeatWaited = false
    await update($, isPaneOpen, () => false)
    // Opened again, it is on the five cards.
    await update($, isCasting, () => false)
    if (e.origin.kind === 'person') await update($, isPaneDismissed, () => true)

    return next(e)
  }).catch(($, e, next) => next(e))

  // 원이 conducts: the main loop's system prompt gains her voice and the roster.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    if (!isLeaderVoiced || e.traits.includes('bare') || e.traits.includes('sdk-preset') || !(await read($, isOn))) return composed

    return {
      ...composed,
      sections: [...composed.sections, { id: 'rescene:leader', text: leaderSection(await read($, cast)), scope: 'session' as const }],
    }
  })

  // A session already under way keeps the system prompt it began with, so the
  // main loop is also told once beside a prompt the person types, and told
  // again after a compaction took that away.
  on('prompt.submit', async ($, e, next) => {
    if (!TYPED.has(e.origin.kind)) return next(e)
    // A theme changed since the last prompt is followed from this one: no setting is watched as it is made.
    await readTheme($).catch(() => undefined)
    const briefing = await read($, briefed)
    const isModeOn = await read($, isOn)
    const said = e.text.trimStart().startsWith('/') ? '' : askOf(e.text)

    // What was just asked: a message typed mid-turn becomes the turn's ask
    // at once, and one that opens a turn waits for the turn to begin.
    // A command that carries a request (`/goal 버튼 고쳐 줘`) goes to whom the person picked, as a typed prompt does.
    const called = /^\/(\S+)\s+\S/.exec(e.text.trimStart())?.[1]
    const isRequest = said !== '' || (called !== undefined && !LOCAL.has(called.toLowerCase()))
    const aimed = isModeOn && isRequest ? await read($, target) : null

    if (isModeOn && said !== '') {
      await mark($, 'hello', '새 세션, 잘 부탁드립니다').catch(() => undefined)
      asked = said
      askedTo = aimed
      await update($, turn, now => (now === null ? now : { startedAt: now.startedAt, ask: said, ...(aimed === null ? {} : { to: aimed }) }))
    }
    const told: string[] = []
    // What is done once the prompt has entered: one that was refused has told the main loop nothing.
    const entered: (() => Promise<unknown>)[] = []
    const roles = await read($, cast)
    const isChanged = await read($, isRecast)
    const changes = recasts
    const heard = (): Promise<unknown> => (recasts === changes ? update($, isRecast, () => false) : Promise.resolve())

    if (isLeaderVoiced && isModeOn && briefing === 'no') {
      told.push(leaderSection(roles))
      // Off since it was sent: the main loop has the briefing all the same, and is to be told it no longer holds.
      entered.push(() => update($, briefed, () => (isLit ? 'yes' : 'undo')))
      if (isChanged) entered.push(heard)
    } else if (isLeaderVoiced && isModeOn && isChanged) {
      // The roster it was told has changed since: the new one, once.
      told.push(castBlock(roles))
      entered.push(heard)
    }
    if (isLeaderVoiced && !isModeOn && briefing === 'undo') {
      told.push(STAND_DOWN)
      entered.push(() => update($, briefed, () => 'no' as const))
    }
    // The member the person picked above the prompt takes this one.
    if (aimed !== null) told.push(aimed === 'woni' ? soloBlock() : aimBlock(aimed, roles))
    const sent = await next(told.length === 0 ? e : { ...e, context: [...(e.context ?? []), ...told] })

    if (sent.drop === undefined) for (const done of entered) await done().catch(() => undefined)

    return sent
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    const isMain = e.agentId === undefined && e.trigger !== 'precompute' && 'messages' in compacted

    if (isMain) await update($, briefed, told => (told === 'yes' ? 'no' : told)).catch(() => undefined)
    if (isMain && (await read($, isOn).catch(() => false))) {
      await pass($, 'compacted').catch(() => undefined)
      await mark($, 'compacted', '대화를 요약해서 줄였어요').catch(() => undefined)
    }

    return compacted
  }).catch(($, e, next) => next(e))

  // The session's figures as the engine measures them: after a turn, and when a limit moves a point.
  on('session.measure', async ($, e, next) => {
    await takeUsage($, e).catch(() => undefined)

    return next(e)
  })

  // The main session's own turn: what was asked, and since when.
  on('turn.start', async ($, e, next) => {
    // A member's own turn opens with her brief, and starts while the main one is under way.
    const isMembers = e.text.includes(MARK) || ((await read($, turn)) !== null && (await read($, tasks)).some(isActive))

    if (!isMembers && (await read($, isOn).catch(() => false))) {
      const startedAt = await $.clock.now()
      const ask = askOf(e.text) || asked
      const to = askedTo

      asked = ''
      askedTo = null
      reads.clear()
      await update($, turn, () => ({ startedAt, ask, ...(to === null ? {} : { to }) }))
      await update($, live, () => ({}))
      await update($, clockNow, () => startedAt)
      dance($)
    }

    return next(e)
  })

  // A subagent starts: a member takes the task and reports in her own voice.
  on('agent.spawn', async ($, e, next) => {
    if (e.fork || e.isTeammate === true || e.subagentType.startsWith('codex:') || !(await read($, isOn))) return next(e)
    const { member: wanted, rest } = namedMember(e.description)
    const title = rest === '' ? e.subagentType : rest
    const role = roleOfAgent(e.subagentType, title) ?? (wanted === undefined ? '구현' : roleIn(await read($, cast), wanted))
    const brief = firstLine(e.prompt)
    const task = await reserve($, { id: `spawn:${e.tool_use_id}`, kind: 'agent', role, engine: e.subagentType, title, call: e.tool_use_id, ...(brief === '' ? {} : { brief }) }, wanted)
    const member = MEMBERS[task.member]
    const started = await next({
      ...e,
      description: `${member.heart} ${member.name} · ${title}`,
      prompt: isMemberVoiced && !e.prompt.includes(MARK) ? e.prompt + memberBlock(task.member, role) : e.prompt,
    }).catch(async (error: unknown) => {
      await drop($, task.id)
      throw error
    })

    if (started.deny !== undefined) await drop($, task.id)
    else if (started.agentId !== undefined) {
      const { agentId } = started

      await update($, tasks, list => list.map(one => (one.id === task.id ? { ...one, id: agentId } : one)))
    }

    return started
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const command = e.tool === 'Bash' ? e.command : ''
    // A launch, not a command that only has the name in it (a commit message, a grep).
    const isFleet = command.includes('fleet-run') && findFleetRuns(command).length > 0

    if (!(await read($, isOn))) return next(e)
    if (e.agentId === undefined) {
      const { member, phrase, past } = actionOf(e.tool, e, await read($, cast))
      const at = await $.clock.now()
      const begin = (one: Live | undefined): Live => {
        const open = [...(one?.open ?? []), { id: e.tool_use_id, phrase }]

        return { phrase, at, running: open.length, count: (one?.count ?? 0) + 1, open }
      }

      await update($, live, now => ({ ...now, [member]: begin(now[member]) }))
      if (e.tool === 'Read') {
        const seen = (reads.get(e.file_path) ?? 0) + 1

        reads.set(e.file_path, seen)
        if (seen === MET_AGAIN) {
          const name = e.file_path.slice(e.file_path.lastIndexOf('/') + 1)

          await pass($, 'again').catch(() => undefined)
          await mark($, 'again', `${name}, 이번 턴에만 ${seen}번째 읽어요`).catch(() => undefined)
        }
      }
      // The main session calling a tool is a turn under way, whether or not its start was seen
      // (a reload mid-turn, a turn the engine continued by itself).
      if ((await read($, turn)) === null) {
        const ask = asked
        const to = askedTo

        asked = ''
        askedTo = null
        await update($, turn, () => ({ startedAt: at, ask, ...(to === null ? {} : { to }) }))
        dance($)
      }
      // The call that ends leaves the card to the latest one still running, or to how it went:
      // done, or refused or failed, which is not "done".
      const leave = async (how: '' | '거절됨' | '실패' = ''): Promise<void> => {
        const ended = await $.clock.now()
        const what = past.includes(': ') ? past.slice(past.indexOf(': ') + 2) : past
        const text = how === '' ? past : `${how}: ${what}`
        const box = { isHers: false }

        await update($, live, now => {
          const one = now[member]

          // Its call is no longer open: the mode went off, or a new turn began, while it ran.
          box.isHers = one?.open?.some(call => call.id === e.tool_use_id) === true
          if (one === undefined || !box.isHers) return now
          const open = (one.open ?? []).filter(call => call.id !== e.tool_use_id)
          const { isFailed: _isFailed, ...rest } = one

          return { ...now, [member]: { ...rest, phrase: open.at(-1)?.phrase ?? text, at: ended, running: open.length, open, ...(how !== '' && open.length === 0 ? { isFailed: true } : {}) } }
        })
        if (box.isHers) await update($, steps, now => ({ ...now, [member]: [...(now[member] ?? []), { at: ended, text }].slice(-TRAIL_KEPT) }))
      }

      if (e.tool !== 'Agent' && !isFleet) {
        const ran = await next(e).catch(async (error: unknown) => {
          await leave('실패').catch(() => undefined)
          throw error
        })

        await leave(ran.deny !== undefined ? '거절됨' : ran.isError === true ? '실패' : '').catch(() => undefined)

        return ran
      }
      // An Agent call and a fleet-run launch go on below; 원이 has handed over by then.
      void $.clock.after(1500, () => void leave().catch(() => undefined))
    }
    if (e.agentId !== undefined) {
      const did = actionOf(e.tool, e)

      await touch($, e.agentId, e.tool, did.phrase, did.past, e.tool_use_id).catch(() => undefined)
    }

    if (e.tool === 'Bash' && isFleet) {
      const home = await $.env.get('HOME').catch(() => undefined)
      const isMoved = /(?:^|[\s;&(])cd\s/.test(command)
      const usable = (path: string | undefined): string | undefined =>
        path === undefined || (isMoved && !path.startsWith('/')) ? undefined : path
      const runs = findFleetRuns(command, home)
      const made: { task: Task; voiced?: string }[] = []
      // Where the person asked for it, one launch and nothing else is made to keep its screen for the
      // backstage, in a shell whose record of a pipe's exit codes is known: zsh or bash, by the session's own.
      const isKept = isScreenKept && runs.length === 1 && isPlainLaunch(command) && /(?:^|\/)(?:zsh|bash)$/.test((await $.env.get('SHELL').catch(() => undefined)) ?? '')
      let rewritten = command
      let kept: string | undefined

      for (const [index, run] of runs.entries()) {
        const role = roleOfRun(run.profile, run.title)
        const out = usable(run.out)
        const asked = usable(run.spec)
        const brief = asked === undefined ? undefined : await $.fs.read(asked).catch(() => undefined)

        // A spec that can be looked for, is not there, and is not written by this
        // command either: the command only mentions a launch.
        const isMade = run.rawSpec !== undefined && writes(command, run.rawSpec)

        if (asked !== undefined && brief === undefined && !isMade) continue
        const metaAt = out === undefined ? undefined : (await $.fs.stat(`${out}.meta.json`).catch(() => undefined))?.mtimeMs
        // Only a path that stands in quotes as it is.
        const screen = isKept && out !== undefined && /^[\w@%+=:,./-]+$/.test(out) ? `${out}.live.log` : undefined
        const order = brief === undefined ? '' : firstLine(brief)
        const task = await reserve($, {
          id: `orca:${e.tool_use_id}:${index}`,
          kind: 'orca',
          role,
          engine: run.profile,
          title: run.title,
          call: e.tool_use_id,
          ...(out === undefined ? {} : { out }),
          ...(order === '' ? {} : { brief: order }),
          ...(screen === undefined ? {} : { live: screen }),
        })

        if (metaAt !== undefined) await update($, tasks, list => list.map(one => (one.id === task.id ? { ...one, metaAt } : one)))
        kept = screen
        const spec = usable(run.spec)
        let voiced: string | undefined

        if (isOrcaVoiced && spec !== undefined && run.rawSpec !== undefined && !isMade) {
          const text = brief

          if (text !== undefined && !text.includes(MARK)) {
            const path = voicedSpecPath(spec, made.some(one => one.task.member === task.member) ? `${task.member}-${index}` : task.member)
            const isWritten = await $.fs.write(path, text + orcaBlock(task.member, role)).then(() => true, () => false)

            if (isWritten && swapSpec(rewritten, run.rawSpec, path) !== rewritten) {
              voiced = path
              rewritten = swapSpec(rewritten, run.rawSpec, path)
            }
          }
        }
        made.push(voiced === undefined ? { task } : { task, voiced })
      }

      // The worker's progress goes to a file beside its result as well as to where it went before;
      // the launch's own exit code stays the command's.
      // No option of the shell's is set and nothing runs before the launch; its exit code is read off the
      // pipe's own record, which zsh and bash each keep under a name of their own. A launch that is a
      // function of the shell's runs beside it, which is why this is asked for and not done unasked.
      if (kept !== undefined && made.length === 1) rewritten = `${rewritten.trim()} 2>&1 | { tee '${kept}' 2>/dev/null || cat; }; (exit "\${PIPESTATUS[0]:-\${pipestatus[1]}}")`

      const { agentId } = e
      const ran = await next(rewritten === command ? e : { ...e, command: rewritten }).catch(async (error: unknown) => {
        if (agentId !== undefined) await amend($, agentId, e.tool_use_id, '실패').catch(() => undefined)
        for (const { task } of made) await drop($, task.id)
        throw error
      })

      if (agentId !== undefined && ran.deny !== undefined) await amend($, agentId, e.tool_use_id, '거절됨').catch(() => undefined)
      if (made.length === 0) {
        if (agentId !== undefined && ran.isError === true) await amend($, agentId, e.tool_use_id, '실패').catch(() => undefined)

        return ran
      }
      if (ran.deny !== undefined) {
        for (const { task } of made) await drop($, task.id)

        return ran
      }

      if (agentId !== undefined && ran.isError === true) await amend($, agentId, e.tool_use_id, '실패').catch(() => undefined)
      const isLeft = isDetached(command) || e.run_in_background === true
      // Launched in an Orca terminal of its own, the one the command opens: its handle is in what the
      // command printed, and its screen can be read by it.
      const isTabbed = made.length === 1 && isTerminalAlone(command)
      const term = isTabbed ? termOf(printed(ran)) : undefined
      // The terminal was not opened, by the opening's own word: there is no worker to wait for. Piped
      // to a filter, a failure may be the filter's, and the worker is waited for by its result as ever.
      const isUnopened = isTabbed && term === undefined && ran.isError === true && !bareOf(command).includes('|')

      if (term !== undefined) await update($, tasks, list => list.map(one => (one.id === made[0]?.task.id ? { ...one, term } : one)))
      for (const { task } of made) {
        if (isUnopened) {
          await settle($, task.id, false, '터미널을 열지 못함')
          continue
        }
        if (task.out !== undefined) await pollWorker($, task).catch(() => undefined)
        if (!isLeft) await settle($, task.id, ran.isError !== true, '')
        else if (task.out === undefined) {
          const note = '결과 파일 경로를 읽지 못해서, 끝났는지는 직접 확인해야 해요'

          await update($, tasks, list => list.map(one => (one.id === task.id ? { ...one, status: 'waiting' as const, note } : one)))
        }
      }

      const lines = made.map(({ task, voiced }) => {
        const who = `${MEMBERS[task.member].name}(${task.role})`
        const copy = voiced === undefined ? '' : ` 작업지시 끝에 ${MEMBERS[task.member].name} 말투 지시를 붙인 사본(${voiced})으로 실행했다.`

        return `[리센느 배정] fleet-run ${task.engine} "${task.title}" 작업은 ${who}가 맡았다.${copy}`
      })

      return { ...ran, context: [...(ran.context ?? []), ...lines] }
    }

    const { agentId } = e
    const ran = await next(e).catch(async (error: unknown) => {
      if (agentId !== undefined) await amend($, agentId, e.tool_use_id, '실패').catch(() => undefined)
      throw error
    })

    if (agentId !== undefined && (ran.deny !== undefined || ran.isError === true)) await amend($, agentId, e.tool_use_id, ran.deny !== undefined ? '거절됨' : '실패').catch(() => undefined)
    if (e.agentId !== undefined && ran.deny !== undefined) {
      const task = (await read($, tasks)).find(one => one.id === e.agentId)

      if (task !== undefined) {
        const at = await $.clock.now()

        await speak($, { member: task.member, quote: say(task.member, 'denied', task.toolCount, task.role), note: `${e.tool} 거절당함`, at })
      }
    }
    if (e.tool === 'Agent' && e.agentId === undefined && ran.deny === undefined) {
      const task = (await read($, tasks)).find(one => one.call === e.tool_use_id && one.kind === 'agent')

      if (task !== undefined) {
        const who = `${MEMBERS[task.member].name}(${task.role})`

        return { ...ran, context: [...(ran.context ?? []), `[리센느 배정] 이 작업은 ${who}가 맡았다. 사용자에게 전할 때는 ${MEMBERS[task.member].name}가 한 일로 말한다.`] }
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const spent = e.usage === undefined ? undefined : tokensOf(e.usage)

    if (e.agentId === undefined) {
      await update($, turn, () => null).catch(() => undefined)
      await update($, live, now => Object.fromEntries(Object.entries(now).map(([id, one]) => [id, { ...one, running: 0, open: [] }]))).catch(() => undefined)
    }
    if (await read($, isOn).catch(() => false)) {
      if (e.agentId === undefined) {
        if (spent !== undefined) await update($, leaderTokens, total => plus(total, spent))
        await refreshUsage($).catch(() => undefined)
        await stamp($)
      } else {
        await adopt($, e.agentId).catch(() => undefined)
        const why = e.reason === 'aborted' ? '중단됨' : e.reason === 'error' ? 'API 오류' : e.reason === 'refusal' ? '거절' : ''

        await settle($, e.agentId, e.reason === 'answer', why, spent, firstLine(e.answer)).catch(() => undefined)
        const summary = linesOf(e.answer ?? '', 14)
        const { agentId } = e

        if (summary.length > 1) await update($, tasks, list => list.map(task => (task.id === agentId ? { ...task, summary } : task))).catch(() => undefined)
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e)
    const task = (await read($, tasks)).find(one => one.id === e.requestId && isActive(one))
    const doing = Object.entries(await read($, live)).filter(([, one]) => one.running > 0).sort(([, a], [, b]) => b.at - a.at)[0]
    const who = doing === undefined ? undefined : MEMBERS[doing[0] as MemberId]
    const word =
      task !== undefined
        ? `${MEMBERS[task.member].heart} ${MEMBERS[task.member].name} ${task.detail ?? `${task.role} 중`}`
        : who !== undefined && doing !== undefined && e.props.mode === 'tool-use'
          ? `${who.heart} ${who.name} ${doing[1].phrase}`
          : `${MEMBERS.woni.heart} ${SPINNER[e.props.mode] ?? SPINNER.thinking}`

    return next({ ...e, props: { ...e.props, word } })
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await read($, isOn))) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const line = lineOf('woni', await read($, isLight))
    const isLong = e.props.durationMs >= 600_000
    const quote = isLong ? '사실 그냥 지나갈 수 있는 하루를, 저에게 써 주셔서 감사합니다.' : Math.floor(e.props.durationMs / 1000) % 2 === 0 ? LEADER.tasty : LEADER.allDone

    return (
      <Box gap={1}>
        <Text color={line}>♥</Text>
        <Text backgroundColor={MEMBERS.woni.color} color={MEMBERS.woni.ink} bold>
          {' 원이 '}
        </Text>
        <Text color={line} italic>{`“${quote}”`}</Text>
        <Text dimColor>{spoken(e.props.durationMs)}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isBandShown || e.surface !== 'terminal' || e.props.hasSurvey || !(await read($, isOn))) return next(e)
    const scene = await sceneOf($)
    // The stage's own rows give way to an open pane; the row that names who takes the next prompt stays.
    const isStatus = isLive(scene) && !(await read($, isPaneOpen))

    return drawBand({ ...$.ui.resolve(e), isLight: await read($, isLight) }, scene, e.props.bodyColumns, e.props.maxRows, {
      isStatus,
      isAimed: true,
      isFull: isBandFull,
      aim: id => void aim($, id).catch(() => undefined),
      setup: () => void setup($, true).catch(() => undefined),
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const scene = await sceneOf($)
    const isShown = await read($, isOn)

    if (e.surface === 'terminal') {
      const room = { columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows }

      const movers = isShown ? moversOf(scene) : []

      isLightDrawn = await read($, isLight)

      isStaged = scene.isCasting ? false : scene.focus !== null ? room.columns >= 50 && room.rows >= 14 : densityOf(scene, room) === 'full'
      iconed = scene.focus !== null ? [scene.focus] : ORDER
      moving = movers.filter(id => iconed.includes(id))

      return drawPane({ ...$.ui.resolve(e), isLight: isLightDrawn }, scene, isShown, room, beat, {
        pick: id => void pick($, id).catch(() => undefined),
        setup: isOpen => void setup($, isOpen).catch(() => undefined),
        recast: (id, role) => void giveRole($, id, role).catch(() => undefined),
      })
    }
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {[...rosterLines(scene), ...usageLines(scene)].map(line => (
          <Text>{line}</Text>
        ))}
      </Box>
    )
  })
}
