import type { Color, Elements, RenderElement } from 'claude-code'

import type { Cast, Line, Live, MemberId, Peek, Said, Step, Task, Tokens, Turn, Usage } from '../types'

import type { WorkRole } from './members'
import { langNow, t } from './lang'
import { CAST, dutyOf, isActive, isSameCast, LEADER, lineOf, MEMBERS, nameOf, ORDER, PINK, pinkOf, roleIn, roleName, ROLES, say, unitOf, WORKERS } from './members'
import { frameOf, ICON_COLUMNS, ICON_ROWS, iconOf, LOGO, logoOf } from './sprites'

/** The elements a drawing is made of, and whether the terminal's theme is a light one. */
export type Kit = Pick<Elements['terminal'], 'Box' | 'Text' | 'Raster' | 'Button'> & { isLight?: boolean }

export type Scene = {
  tasks: readonly Task[]
  now: number
  waveAt: number
  leader: Said | null
  ticker: Said | null
  usage: Usage | null
  leaderTokens: Tokens
  feed: readonly Said[]
  cup: readonly Line[]
  turn: Turn | null
  live: { readonly [id in MemberId]?: Live }
  steps: { readonly [id in MemberId]?: readonly Step[] }
  focus: MemberId | null
  peek: Peek | null
  target: MemberId | null
  banked: { readonly [id in MemberId]?: Tokens }
  /** Who has which kind of work. */
  cast: Cast
  /** The pane shows the screen the roles are set on. */
  isCasting: boolean
}

/** What a press in the pane does: opens a member's backstage, or (nobody) goes back to the cards. */
export type Acts = {
  pick?: (id: MemberId | null) => void
  /** Opens the screen the roles are set on, or leaves it. */
  setup?: (isOpen: boolean) => void
  /** Gives a kind of work to a member; nobody named, every member has her own again. */
  recast?: (id: MemberId | null, role: WorkRole) => void
}

/** What the band above the prompt shows, and what a press on a member's name there does. */
export type Band = {
  /** The stage's own rows: who is on, the line just said. */
  isStatus: boolean
  /** The row that names who takes the next prompt, with the usage beside it. */
  isAimed: boolean
  /** Drawn to be seen: a rule above, each member with her heart and her kind of work, the usage as bars on a row of its own. */
  isFull?: boolean
  aim?: (id: MemberId | null) => void
  /** Opens the screen the roles are set on. */
  setup?: () => void
}

/** The room a pane has: the cells across its body, and the rows it may take. */
export type Room = { columns: number; rows: number }

const MARK: Record<Task['status'], string> = { running: '●', waiting: '◐', done: '✓', failed: '✗' }
const WORD_KO: Record<Task['status'], string> = { running: '작업 중', waiting: '기다리는 중', done: '끝', failed: '실패' }
const WORD_EN: Record<Task['status'], string> = { running: 'working', waiting: 'waiting', done: 'done', failed: 'failed' }
const wordOf = (status: Task['status']): string => t(WORD_KO, WORD_EN)[status]
const TINT: Record<Task['status'], Color | undefined> = {
  running: undefined,
  waiting: 'warning',
  done: 'success',
  failed: 'error',
}

const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
]

const SEGMENTER = typeof Intl === 'object' && 'Segmenter' in Intl ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : undefined

/** A text as the terminal draws it: what it sets in one place (a syllable of loose jamo, an emoji joined of several) is one. */
const graphemes = (text: string): string[] => (SEGMENTER === undefined ? [...text] : Array.from(SEGMENTER.segment(text), part => part.segment))

const cellsOfChar = (part: string): number => {
  const code = part.codePointAt(0) ?? 0

  // Drawn as an emoji whatever it opens with: a heart with its selector, a family joined of three.
  if (part.length > 1 && (part.includes('\ufe0f') || part.includes('\u200d'))) return 2
  if (code === 0xfe0f || code === 0x200d || code === 0x200b || (code >= 0x300 && code <= 0x36f)) return 0

  return WIDE.some(([from, to]) => code >= from && code <= to) ? 2 : 1
}

/** Cells a string takes on a terminal row: Hangul, kana and emoji take two. */
export const cells = (text: string): number => {
  let total = 0

  for (const part of graphemes(text)) total += cellsOfChar(part)

  return total
}

/** The text cut to a width in cells, an ellipsis standing for what was cut. */
export const fit = (text: string, width: number): string => {
  if (width <= 0) return ''
  if (cells(text) <= width) return text
  let kept = ''
  let used = 0

  for (const part of graphemes(text)) {
    const next = cellsOfChar(part)

    if (used + next > width - 1) break
    kept += part
    used += next
  }

  return `${kept}…`
}

export const pad = (text: string, width: number): string => text + ' '.repeat(Math.max(0, width - cells(text)))

export const clock = (ms: number): string => {
  const seconds = Math.max(0, Math.floor(ms / 1000))

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export const spoken = (ms: number): string => {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(seconds / 60)

  return minutes === 0 ? t(`${seconds}초`, `${seconds}s`) : t(`${minutes}분 ${seconds % 60}초`, `${minutes}m ${seconds % 60}s`)
}

export const elapsed = (task: Task, now: number): number => (task.endedAt ?? Math.max(now, task.startedAt)) - task.startedAt

/** The tasks of the wave on stage: the active ones first, then the newest. */
export const onStage = (scene: Scene): Task[] =>
  scene.tasks
    .filter(task => task.startedAt >= scene.waveAt || isActive(task))
    .sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || b.startedAt - a.startedAt)

const latest = (scene: Scene): Said | null => {
  const { leader, ticker } = scene

  if (leader === null || ticker === null) return leader ?? ticker

  return leader.at >= ticker.at ? leader : ticker
}

const Badge = ({ Text }: Kit, id: MemberId): RenderElement => (
  <Text backgroundColor={MEMBERS[id].color} color={MEMBERS[id].ink} bold>
    {` ${nameOf(id)} `}
  </Text>
)

const Heart = ({ Text, isLight }: Kit, id: MemberId): RenderElement => <Text color={lineOf(id, isLight)}>♥ </Text>

// ---- usage

/** A token count the way its reader says it: 4.6천, 17.1만, 1.2억 in Korean; 4.6k, 171k, 120M in English. */
export const amount = (tokens: number): string => {
  const short = (value: number): string => (value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10))

  if (langNow() === 'en') {
    // A figure that would round up to a thousand of its unit is said in the next one.
    if (tokens >= 999_500_000) return `${short(tokens / 1_000_000_000)}B`
    if (tokens >= 999_500) return `${short(tokens / 1_000_000)}M`

    return tokens >= 1_000 ? `${short(tokens / 1_000)}k` : String(Math.round(tokens))
  }
  if (tokens >= 100_000_000) return `${short(tokens / 100_000_000)}억`
  if (tokens >= 10_000) return `${short(tokens / 10_000)}만`
  if (tokens >= 1_000) return `${short(tokens / 1_000)}천`

  return String(Math.round(tokens))
}

export const ZERO: Tokens = { fresh: 0, cached: 0, out: 0 }

export const plus = (a: Tokens, b: Tokens | undefined): Tokens => {
  if (b === undefined) return a
  const usd = a.usd === undefined && b.usd === undefined ? undefined : (a.usd ?? 0) + (b.usd ?? 0)

  return { fresh: a.fresh + b.fresh, cached: a.cached + b.cached, out: a.out + b.out, usd }
}

export const spent = (tokens: Tokens): string => {
  const cost = tokens.usd === undefined ? '' : ` · $${tokens.usd.toFixed(2)}`

  return t(`입력 ${amount(tokens.fresh)} · 캐시 ${amount(tokens.cached)} · 출력 ${amount(tokens.out)}${cost}`, `in ${amount(tokens.fresh)} · cache ${amount(tokens.cached)} · out ${amount(tokens.out)}${cost}`)
}

const SPENT = new WeakMap<Scene, Record<MemberId, Tokens>>()

/** What each member has spent so far: her tasks summed with those no longer listed, 원이's the main loop's. */
export const spentBy = (scene: Scene): Record<MemberId, Tokens> => {
  const summed = SPENT.get(scene)

  if (summed !== undefined) return summed
  const by: Record<MemberId, Tokens> = {
    woni: plus(scene.leaderTokens, scene.banked.woni),
    liv: scene.banked.liv ?? ZERO,
    minami: scene.banked.minami ?? ZERO,
    may: scene.banked.may ?? ZERO,
    zena: scene.banked.zena ?? ZERO,
  }

  for (const task of scene.tasks) by[task.member] = plus(by[task.member], task.tokens)
  SPENT.set(scene, by)

  return by
}

const isSpent = (tokens: Tokens): boolean => tokens.fresh + tokens.cached + tokens.out > 0 || tokens.usd !== undefined

const LIMIT_KO: Record<string, string> = { five_hour: '5시간', seven_day: '7일', spend_limit: '지출' }
const LIMIT_EN: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }
const limitOf = (kind: string): string => t(LIMIT_KO, LIMIT_EN)[kind] ?? kind
const battery = (): string => t('배터리', 'battery')

export const until = (at: number, now: number): string => {
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  const hours = Math.floor(minutes / 60)

  if (hours >= 48) return t(`${Math.floor(hours / 24)}일 뒤 초기화`, `resets in ${Math.floor(hours / 24)}d`)

  return hours === 0 ? t(`${minutes}분 뒤 초기화`, `resets in ${minutes}m`) : t(`${hours}시간 ${minutes % 60}분 뒤 초기화`, `resets in ${hours}h ${minutes % 60}m`)
}

const bar = (percent: number, size = 10): string => {
  const lit = percent <= 0 ? 0 : Math.max(1, Math.min(size, Math.round((percent / 100) * size)))

  return '▰'.repeat(lit) + '▱'.repeat(size - lit)
}

/** The context window still free, 0 to 100, when the engine has a reading. */
export const batteryOf = (usage: Usage | null): number | undefined =>
  usage?.contextPercent === undefined ? undefined : Math.max(0, 100 - usage.contextPercent)

/** The band's one-glance gauge: battery left, and the five-hour window. */
export const gaugeOf = (usage: Usage | null): string => {
  const free = batteryOf(usage)
  const window = usage?.limits.find(limit => limit.kind === 'five_hour')

  return [free === undefined ? '' : `${battery()} ${Math.round(free)}%`, window === undefined ? '' : `${limitOf('five_hour')} ${window.percentUsed}%`]
    .filter(part => part !== '')
    .join(' · ')
}

/** The usage in a row: as many of its figures, the nearest limit first, as the room holds. */
export const gaugeIn = (usage: Usage | null, room: number): string => {
  const free = batteryOf(usage)
  const window = (kind: string): string => {
    const limit = usage?.limits.find(one => one.kind === kind)

    return limit === undefined ? '' : `${limitOf(kind)} ${Math.round(limit.percentUsed)}%`
  }
  const parts = [free === undefined ? '' : `${battery()} ${Math.round(free)}%`, window('five_hour'), window('seven_day'), usage?.usd === undefined ? '' : `$${usage.usd.toFixed(2)}`].filter(part => part !== '')

  for (let kept = parts.length; kept > 0; kept -= 1) {
    const text = parts.slice(0, kept).join(' · ')

    if (cells(text) <= room) return text
  }

  return ''
}

type Meter = { label: string; percent: number; tint: Color; text: string; reset: string; unit: string }

const metersOf = (scene: Scene): Meter[] => {
  const { usage } = scene
  const free = batteryOf(usage)
  const meters: Meter[] = []

  if (usage !== null && free !== undefined) {
    meters.push({
      label: battery(),
      percent: free,
      tint: free < 20 ? 'error' : free < 40 ? 'warning' : 'success',
      text: t(`${Math.round(free)}% 남음 · 컨텍스트 ${amount(usage.contextTokens ?? 0)} / ${amount(usage.contextWindow)}`, `${Math.round(free)}% left · context ${amount(usage.contextTokens ?? 0)} / ${amount(usage.contextWindow)}`),
      reset: '',
      unit: t('남음', 'left'),
    })
  }
  for (const limit of usage?.limits ?? []) {
    const due = limit.resetsAt === undefined ? '' : until(limit.resetsAt, scene.now)
    const reset = due === '' ? '' : ` · ${due}`

    meters.push({
      label: limitOf(limit.kind),
      percent: limit.percentUsed,
      tint: limit.percentUsed >= 90 ? 'error' : limit.percentUsed >= 70 ? 'warning' : 'success',
      text: t(`${limit.percentUsed}% 사용${reset}`, `${limit.percentUsed}% used${reset}`),
      reset: due,
      unit: t('사용', 'used'),
    })
  }

  return meters
}

const spendersOf = (scene: Scene): MemberId[] => {
  const by = spentBy(scene)

  return ORDER.filter(id => isSpent(by[id]))
}

const spentHead = (): string => t('멤버별 토큰 · 따로 맡은 일만 (함께 한 일은 원이 몫)', "Tokens by member · her own tasks only (work beside WONI counts as WONI's)")

/**
 * A member's line under the usage card. Tokens are counted where a model
 * session is: a subagent's or a worker's are hers, and what she does beside
 * 원이 in the main session is spent by that session, so it is 원이's.
 */
export const spentLine = (id: MemberId, scene: Scene): string => {
  const tokens = spentBy(scene)[id]
  const running = scene.tasks.filter(task => task.member === id && isActive(task)).length
  const beside = id === 'woni' ? undefined : scene.live[id]
  const waiting = running === 0 ? '' : t(`작업 중 ${running}개는 끝나면 집계`, `${running} running, counted when done`)

  if (isSpent(tokens)) return running === 0 ? spent(tokens) : t(`${spent(tokens)} · +${running}개 진행 중`, `${spent(tokens)} · +${running} running`)
  if (waiting !== '') return waiting
  if (beside !== undefined) return t(`따로 맡은 일 없음 · 원이와 함께 ${beside.count}번`, `no task of her own · ${beside.count} beside WONI`)

  return scene.tasks.some(task => task.member === id) ? t('맡은 일은 있었지만 토큰 기록을 못 받음', 'had tasks, but no token record came') : t('따로 맡은 일 없음', 'no task of her own')
}

/** Rows the usage card takes, frame and all: with every member's line, or with only theirs who spent. */
const usageRows = (scene: Scene, isWhole = false): number => {
  const listed = isWhole ? ORDER.length : spendersOf(scene).length

  return 2 + 1 + Math.max(1, metersOf(scene).length + (listed === 0 ? 0 : listed + 1))
}

/** The usage card: the live's battery, the plan's windows, who spent what. */
const UsageCard = (kit: Kit, scene: Scene, width: number, isWhole: boolean): RenderElement => {
  const { Box, Text } = kit
  const inner = width - 4
  const meters = metersOf(scene)
  const by = spentBy(scene)
  const listed = isWhole ? ORDER : spendersOf(scene)
  const usd = scene.usage?.usd

  return (
    <Box borderStyle="round" borderColor={pinkOf(kit.isLight)} paddingX={1} flexDirection="column" width={width}>
      <Box justifyContent="space-between" width={inner}>
        <Text color={pinkOf(kit.isLight)} bold>
          {t('사용량', 'Usage')}
        </Text>
        {usd !== undefined && <Text dimColor>{fit(`${t('Claude 세션', 'Claude session')} $${usd.toFixed(2)}`, inner - 8)}</Text>}
      </Box>
      {meters.map(meter => (
        <Text key={meter.label} wrap="truncate-end">
          <Text dimColor>{pad(meter.label, t(7, 8))}</Text>
          <Text color={meter.tint}>{bar(meter.percent)}</Text>
          <Text>{` ${fit(meter.text, inner - t(18, 19))}`}</Text>
        </Text>
      ))}
      {listed.length > 0 && <Text dimColor>{fit(spentHead(), inner)}</Text>}
      {meters.length === 0 && listed.length === 0 && <Text dimColor>{fit(t('아직 읽은 사용량이 없어요.', 'No usage read yet.'), inner)}</Text>}
      {listed.map(id => (
        <Text key={id} wrap="truncate-end">
          {Heart(kit, id)}
          <Text>{pad(nameOf(id), 7)}</Text>
          <Text dimColor={!isSpent(by[id])}>{fit(spentLine(id, scene), inner - 9)}</Text>
        </Text>
      ))}
    </Box>
  )
}

// ---- the band

type Chip = { task: Task; text: string }

const chipsFor = (stage: readonly Task[], now: number, room: number): { chips: Chip[]; hidden: number } => {
  const forms: ((task: Task) => string)[] = [
    task => ` ${MARK[task.status]} ${roleName(task.role)} ${clock(elapsed(task, now))}`,
    task => ` ${MARK[task.status]} ${clock(elapsed(task, now))}`,
    task => ` ${MARK[task.status]}`,
  ]
  const need = (task: Task, form: (task: Task) => string): number => cells(nameOf(task.member)) + 2 + cells(form(task)) + 1

  for (const form of forms) {
    if (stage.reduce((total, task) => total + need(task, form), 0) <= room) {
      return { chips: stage.map(task => ({ task, text: form(task) })), hidden: 0 }
    }
  }

  const form = forms[2] ?? ((): string => '')
  const chips: Chip[] = []
  let left = room - 4

  for (const task of stage) {
    if (need(task, form) > left) break
    chips.push({ task, text: form(task) })
    left -= need(task, form)
  }

  return { chips, hidden: stage.length - chips.length }
}

/** What the row of names says of who takes the next prompt: nobody named, 원이 hands the work out as she sees fit. */
export const aimHint = (target: MemberId | null): string => (target === null ? t('원이가 나눠 맡김', 'WONI hands it out') : target === 'woni' ? t('원이가 직접 처리', 'WONI does it herself') : t(`다음 명령은 ${nameOf(target)}에게`, `next goes to ${nameOf(target)}`))

/** The name that stands for nobody named: the default. */
const auto = (): string => t('자동', 'auto')
const aimLabel = (): string => t('받는 멤버', 'Send to')
const setupLabel = (): string => t('역할 설정', 'Roles')

/** The row that names who takes the next prompt: a press on a name picks her, and the usage stands beside. */
const AimRow = (kit: Kit, scene: Scene, columns: number, band: Band, withBrand: boolean, withGauge = true): RenderElement => {
  const { Box, Text, Button } = kit
  const { aim } = band
  const picked = scene.target
  const hint = aimHint(picked)
  const names = cells(auto()) + 1 + ORDER.reduce((total, id) => total + cells(nameOf(id)) + 1, 0) + 4
  // Too narrow for all of it: the label goes, then the brand, then every name but the one picked.
  const withLabel = columns >= (withBrand ? 10 : 0) + cells(aimLabel()) + 1 + names
  const isBranded = withBrand && columns >= 10 + names
  const shown: readonly (MemberId | null)[] = columns >= names ? [null, ...ORDER] : [scene.target]
  const fixed = (isBranded ? 10 : 0) + (withLabel ? cells(aimLabel()) + 1 : 0) + names
  // The usage has the room first; the hint says again what the marked name shows.
  const gauge = withGauge ? gaugeIn(scene.usage, columns - fixed - 1) : ''
  const withHint = columns >= fixed + cells(hint) + 1 + (gauge === '' ? 0 : cells(gauge) + 1)
  const name = (id: MemberId | null): string => (id === null ? auto() : nameOf(id))
  const key = (id: MemberId | null): string => `aim-${id ?? 'auto'}`

  return (
    <Box gap={1}>
      {isBranded && (
        <Text backgroundColor={PINK} color="#000000" bold>
          {' RESCENE '}
        </Text>
      )}
      {(withLabel || shown.length === 1) && <Text dimColor>{aimLabel()}</Text>}
      {shown.map(id =>
        aim === undefined ? (
          <Text key={key(id)} bold={id === picked} dimColor={id !== picked} color={id === picked && id !== null ? lineOf(id, kit.isLight) : undefined}>
            {id === picked ? `[ ${name(id)} ]` : name(id)}
          </Text>
        ) : id === picked ? (
          <Button key={key(id)} variant="primary" onPress={() => aim(id)}>
            {name(id)}
          </Button>
        ) : (
          <Button key={key(id)} plain dimColor onPress={() => aim(id)}>
            {name(id)}
          </Button>
        ),
      )}
      {withHint && <Text color={picked === null ? pinkOf(kit.isLight) : lineOf(picked, kit.isLight)}>{hint}</Text>}
      {gauge !== '' && <Text dimColor>{gauge}</Text>}
    </Box>
  )
}

const GUTTER = 9
const BAND_GAP = 2

/** What a row of the full band is made of, widest first: the first that fits is drawn. */
const widthOf = (parts: readonly number[]): number => parts.reduce((total, one) => total + one, 0) + BAND_GAP * Math.max(0, parts.length - 1)

/**
 * The full band's row that names who takes the next prompt: every member
 * with her heart in her color and her kind of work, the one picked marked.
 * Nothing where the row is too narrow for the five names.
 */
const AimBar = (kit: Kit, scene: Scene, columns: number, band: Band, lead: 'brand' | 'blank', withWay: boolean): RenderElement | undefined => {
  const { Box, Text, Button } = kit
  const { aim } = band
  // The way to the roles stands at the end of the usage's row; here only where that row is not drawn.
  const setup = withWay ? band.setup : undefined
  const picked = scene.target
  const hint = `→ ${aimHint(picked)}`
  const mark = (id: MemberId | null): number => (id === picked && aim !== undefined ? 4 : 0)
  const chip = (id: MemberId, withRoles: boolean): number => 2 + cells(nameOf(id)) + mark(id) + (withRoles ? 1 + cells(roleName(roleIn(scene.cast, id))) : 0)
  const forms = [
    { withLead: true, withLabel: true, withRoles: true, withHint: true, withSetup: true },
    { withLead: true, withLabel: true, withRoles: true, withHint: true, withSetup: false },
    { withLead: true, withLabel: true, withRoles: true, withHint: false, withSetup: true },
    { withLead: true, withLabel: false, withRoles: true, withHint: false, withSetup: true },
    { withLead: true, withLabel: false, withRoles: false, withHint: false, withSetup: true },
    { withLead: true, withLabel: false, withRoles: false, withHint: false, withSetup: false },
    { withLead: false, withLabel: false, withRoles: false, withHint: false, withSetup: false },
  ].map(form => ({ ...form, withSetup: form.withSetup && setup !== undefined }))
  const need = (form: (typeof forms)[number]): number =>
    widthOf([
      ...(form.withLead ? [GUTTER] : []),
      ...(form.withLabel ? [cells(aimLabel())] : []),
      cells(auto()) + mark(null),
      ...ORDER.map(id => chip(id, form.withRoles)),
      ...(form.withHint ? [cells(hint)] : []),
      ...(form.withSetup ? [cells(setupLabel())] : []),
    ])
  const form = forms.find(one => need(one) <= columns)

  if (form === undefined) return undefined

  return (
    <Box gap={BAND_GAP}>
      {form.withLead &&
        (lead === 'brand' ? (
          <Text backgroundColor={PINK} color="#000000" bold>
            {' RESCENE '}
          </Text>
        ) : (
          <Text>{' '.repeat(GUTTER)}</Text>
        ))}
      {form.withLabel && (
        <Text color={pinkOf(kit.isLight)} bold>
          {aimLabel()}
        </Text>
      )}
      {aim === undefined ? (
        <Text bold={picked === null}>{auto()}</Text>
      ) : picked === null ? (
        <Button key="aim-auto" variant="primary" onPress={() => aim(null)}>
          {auto()}
        </Button>
      ) : (
        <Button key="aim-auto" plain onPress={() => aim(null)}>
          {auto()}
        </Button>
      )}
      {ORDER.map(id => (
        <Box key={`chip-${id}`}>
          {Heart(kit, id)}
          {aim === undefined ? (
            <Text bold={id === picked}>{nameOf(id)}</Text>
          ) : id === picked ? (
            <Button key={`aim-${id}`} variant="primary" onPress={() => aim(id)}>
              {nameOf(id)}
            </Button>
          ) : (
            <Button key={`aim-${id}`} plain onPress={() => aim(id)}>
              {nameOf(id)}
            </Button>
          )}
          {form.withRoles && <Text dimColor>{` ${roleName(roleIn(scene.cast, id))}`}</Text>}
        </Box>
      ))}
      {form.withHint && (
        <Text color={picked === null ? pinkOf(kit.isLight) : lineOf(picked, kit.isLight)} bold={picked !== null}>
          {hint}
        </Text>
      )}
      {form.withSetup && setup !== undefined && (
        <Button key="setup" plain dimColor onPress={setup}>
          {setupLabel()}
        </Button>
      )}
    </Box>
  )
}

/** The full band's row of usage: each figure a bar in its own tint, and when its window starts over where there is room to say. */
const UsageBar = (kit: Kit, scene: Scene, columns: number, setup?: () => void): RenderElement | undefined => {
  const { Box, Text, Button } = kit
  const way = setup === undefined ? 0 : cells(setupLabel())
  const meters = metersOf(scene)
  const cost = scene.usage?.usd === undefined ? '' : `$${scene.usage.usd.toFixed(2)}`
  const percent = (meter: Meter, withUnits = false): string => `${Math.round(meter.percent)}%${withUnits ? ` ${meter.unit}` : ''}`
  // Whose window is said: every limit's, the nearest's alone, nobody's.
  const forms = [
    { withLead: true, size: 10, resets: 2, withUnits: true, withWay: true },
    { withLead: true, size: 10, resets: 1, withUnits: true, withWay: true },
    { withLead: true, size: 10, resets: 0, withUnits: true, withWay: true },
    { withLead: true, size: 5, resets: 0, withUnits: true, withWay: true },
    { withLead: true, size: 5, resets: 0, withUnits: false, withWay: true },
    { withLead: false, size: 5, resets: 0, withUnits: false, withWay: true },
    { withLead: false, size: 0, resets: 0, withUnits: true, withWay: true },
    { withLead: false, size: 0, resets: 0, withUnits: false, withWay: true },
    { withLead: false, size: 0, resets: 0, withUnits: false, withWay: false },
  ].map(form => ({ ...form, withWay: form.withWay && way > 0 }))
  const reset = (meter: Meter, form: (typeof forms)[number]): string => {
    const limits = meters.filter(one => one.reset !== '')

    return meter.reset !== '' && limits.indexOf(meter) < (form.resets === 2 ? limits.length : form.resets) ? ` · ${meter.reset}` : ''
  }
  const need = (form: (typeof forms)[number]): number =>
    widthOf([
      ...(form.withLead ? [GUTTER, cells(t('사용량', 'Usage'))] : []),
      ...meters.map(meter => cells(meter.label) + (form.size === 0 ? 0 : 1 + form.size) + 1 + cells(percent(meter, form.withUnits)) + cells(reset(meter, form))),
      ...(cost === '' ? [] : [cells(cost)]),
      ...(form.withWay ? [way] : []),
    ])
  const form = forms.find(one => need(one) <= columns)

  if (meters.length === 0 || form === undefined) return undefined

  return (
    <Box gap={BAND_GAP}>
      {form.withLead && (
        <Text color={pinkOf(kit.isLight)} bold>
          {' REMINE♥ '}
        </Text>
      )}
      {form.withLead && (
        <Text color={pinkOf(kit.isLight)} bold>
          {t('사용량', 'Usage')}
        </Text>
      )}
      {meters.map(meter => (
        <Text key={`meter-${meter.label}`}>
          <Text>{meter.label}</Text>
          {form.size > 0 && <Text color={meter.tint}>{` ${bar(meter.percent, form.size)}`}</Text>}
          <Text bold color={meter.tint === 'success' ? undefined : meter.tint}>{` ${percent(meter, form.withUnits)}`}</Text>
          <Text dimColor>{reset(meter, form)}</Text>
        </Text>
      ))}
      {cost !== '' && <Text dimColor>{cost}</Text>}
      {form.withWay && setup !== undefined && (
        <Button key="setup" plain dimColor onPress={setup}>
          {setupLabel()}
        </Button>
      )}
    </Box>
  )
}

/** The band's own rows of the stage: who is on, and under it the line just said or what is being done. */
const StageRows = (kit: Kit, scene: Scene, columns: number, withGauge: boolean, withSaid: boolean): RenderElement[] => {
  const { Box, Text } = kit
  const stage = onStage(scene)
  const unit = unitOf(scene.tasks, Math.floor(scene.waveAt / 1000))
  const doing = ORDER.map(id => ({ id, live: scene.live[id] }))
    .filter((one): one is { id: MemberId; live: Live } => one.live !== undefined)
    .sort((a, b) => b.live.at - a.live.at)
  // The members at work beside 원이 take room on the row too: theirs is set aside before the rest is shared.
  const beside = doing.filter(one => isFresh(one.live, scene.now) && !stage.some(task => task.member === one.id))
  const besideNeed = (id: MemberId): number => cells(nameOf(id)) + 2 + 2 + 1
  const room = columns - 10
  const now: typeof beside = []
  let taken = 0

  for (const [index, one] of beside.entries()) {
    // Unless she is the last, room stays for the `+N` that stands for those left out.
    if (taken + besideNeed(one.id) > room - (index === beside.length - 1 ? 0 : 4)) break
    now.push(one)
    taken += besideNeed(one.id)
  }
  if (now.length < beside.length) taken += 4
  // The usage has its own row where that is drawn. Otherwise it is the first to go, then the unit's name.
  const gauge = withGauge ? gaugeOf(scene.usage) : ''
  const head = unit === undefined ? '' : t(`${unit} 출동`, `${unit} on stage`)
  const plans = [
    { head, gauge },
    { head, gauge: '' },
    { head: '', gauge: '' },
  ].map(plan => ({ ...plan, ...chipsFor(stage, scene.now, room - taken - (plan.head === '' ? 0 : cells(plan.head) + 1) - (plan.gauge === '' ? 0 : cells(plan.gauge) + 1)) }))
  const plan = plans.find(one => one.hidden === 0) ?? plans.at(-1)
  const chips = plan?.chips ?? []
  const hidden = (plan?.hidden ?? 0) + (beside.length - now.length)
  const spoke = latest(scene)
  const act = doing[0]
  // A line just said holds the second row for a while; after that it shows what is being done.
  const said = spoke !== null && (act === undefined || scene.now - spoke.at < 8000) ? spoke : null
  const quoteRoom = said === null ? 0 : columns - 2 - cells(nameOf(said.member)) - 3

  return [
    <Box key="stage" gap={1}>
      <Text backgroundColor={PINK} color="#000000" bold>
        {' RESCENE '}
      </Text>
      {plan !== undefined && plan.head !== '' && <Text bold>{plan.head}</Text>}
      {chips.map(({ task, text }) => (
        <Text key={task.id}>
          {Badge(kit, task.member)}
          <Text color={TINT[task.status]}>{text}</Text>
        </Text>
      ))}
      {now.map(one => (
        <Text key={`live-${one.id}`}>
          {Badge(kit, one.id)}
          <Text>{' ●'}</Text>
        </Text>
      ))}
      {hidden > 0 && <Text dimColor>{`+${hidden}`}</Text>}
      {plan !== undefined && plan.gauge !== '' && <Text dimColor>{plan.gauge}</Text>}
    </Box>,
    ...(withSaid && said === null && act !== undefined
      ? [
          <Text key="doing" wrap="truncate-end">
            {Heart(kit, act.id)}
            {Badge(kit, act.id)}
            <Text bold={act.live.running > 0}>{` ${act.live.running > 0 ? '▸' : act.live.isFailed === true ? '✗' : '✓'} ${fit(act.live.phrase, columns - cells(nameOf(act.id)) - 8)}`}</Text>
          </Text>,
        ]
      : []),
    ...(withSaid && said !== null
      ? [
          <Text key="said" wrap="truncate-end">
            {Heart(kit, said.member)}
            {Badge(kit, said.member)}
            <Text color={lineOf(said.member, kit.isLight)} italic>{` ${fit(`“${said.quote}”`, quoteRoom)}`}</Text>
            <Text dimColor>{` ${fit(said.note, quoteRoom - cells(said.quote) - 3)}`}</Text>
          </Text>,
        ]
      : []),
  ]
}

/**
 * The band above the prompt: who is on stage and the last line said, then
 * who takes the next prompt, then the usage. With fewer rows than it has to
 * show, the rows go in this order: the rule, the line said, the usage's own
 * row (its figures then stand in a few words beside the names), the names.
 */
export const drawBand = (kit: Kit, scene: Scene, columns: number, rows: number, band: Band = { isStatus: true, isAimed: false }): RenderElement => {
  const { Box } = kit
  const isFull = band.isFull === true && band.isAimed
  const hasUsage = isFull && metersOf(scene).length > 0
  // Drawn small, the stage has one row and the names another; the line said keeps to the pane.
  const isSmall = band.isFull === false && band.isAimed
  const wanted = [band.isStatus ? 'stage' : '', band.isAimed ? 'aim' : '', hasUsage ? 'usage' : '', band.isStatus && !isSmall ? 'said' : '', isFull ? 'rule' : ''].filter(one => one !== '')
  const kept = new Set(wanted.slice(0, Math.max(1, rows)))
  const withStage = kept.has('stage')
  // Drawn in full where its usage has a row to go to; otherwise in the one row that holds both.
  const usage = kept.has('usage') ? UsageBar(kit, scene, columns, band.setup) : undefined
  const names = kept.has('aim') && isFull && (usage !== undefined || !hasUsage) ? AimBar(kit, scene, columns, band, withStage ? 'blank' : 'brand', usage === undefined) : undefined

  return (
    <Box flexDirection="column">
      {kept.has('rule') && Ribbon(kit, columns, '▂')}
      {withStage && StageRows(kit, scene, columns, !kept.has('aim'), kept.has('said'))}
      {kept.has('aim') && (names ?? AimRow(kit, scene, columns, band, !withStage, usage === undefined))}
      {kept.has('aim') && usage}
    </Box>
  )
}

// ---- the pane: one card a member

type Card = {
  id: MemberId
  sub: string
  status: string
  tint: Color | undefined
  isIdle: boolean
  work: string
  quote: string
  note: string
  /** The fourth row of a whole card: what she is on now, or what she handed back. */
  last: string
  /** At work this moment: her icon moves. */
  isAtWork: boolean
  /** How busy her task has been, as bars; empty where there is no telling. */
  pulse: string
  /** What a press on her name does, and the digit that presses it. */
  press?: () => void
  hotkey?: string
}

const BARS = '▁▂▃▄▅▆▇█'
const PULSE_MS = 10_000
const PULSE_SHOWN = 10

/** A task's tool calls over the last stretches of time, as bars: tall where she was busy, flat where quiet. */
export const pulseOf = (task: Task, now: number): string => {
  if (task.pulse === undefined || task.pulseAt === undefined) return ''
  const quiet = Math.max(0, Math.floor((now - task.startedAt) / PULSE_MS) - task.pulseAt)
  const beats = [...task.pulse, ...Array.from({ length: Math.min(quiet, PULSE_SHOWN) }, () => 0)].slice(-PULSE_SHOWN)
  const top = Math.max(4, ...beats)

  return beats.map(count => BARS.charAt(Math.min(BARS.length - 1, Math.round((count / top) * (BARS.length - 1))))).join('')
}

/** Which of her idle lines a resting member is on: a new one every while, each member on her own beat. */
const musing = (id: MemberId, now: number): number => Math.floor(now / 45_000) + ORDER.indexOf(id) * 3

/** Whether a member's own call is running, or ended a moment ago. */
export const isFresh = (live: Live, now: number): boolean => live.running > 0 || now - live.at < 6000

/** What the members call the person: the producer. */
const pd = (): string => t('피디니무', 'PD-nim')
const carrying = (): string => t('이어서 작업하는 중', 'carrying on')
const idleMark = (): string => t('○ 대기', '○ idle')
const calls = (count: number): string => t(`도구 ${count}회`, `${count} tool calls`)

/** The day so far in one line, for 원이's card. */
const tally = (scene: Scene): string => {
  const ended = scene.tasks.filter(task => !isActive(task))
  const failed = ended.filter(task => task.status === 'failed').length

  if (ended.length === 0) return ''

  return t(`오늘 무대: ${ended.length - failed}개 끝${failed === 0 ? '' : ` · ${failed}개 실패`}`, `Today: ${ended.length - failed} done${failed === 0 ? '' : ` · ${failed} failed`}`)
}

/** The task of hers a card and her backstage are about: the one she is on, or the last she took. */
export const shownTask = (tasks: readonly Task[], id: MemberId): Task | undefined => {
  const own = tasks.filter(task => task.member === id).sort((a, b) => b.startedAt - a.startedAt)

  return own.find(isActive) ?? own[0]
}

const cardOf = (id: MemberId, scene: Scene): Card => {
  const member = MEMBERS[id]

  if (id === 'woni') {
    const busy = WORKERS.filter(one => scene.tasks.some(task => task.member === one && isActive(task)))

    const names = busy.map(one => nameOf(one)).join(', ')
    const mine = scene.live.woni
    const isConducting = scene.turn !== null || busy.length > 0
    const stage = busy.length === 0 ? '' : t(`무대 위: ${names}`, `On stage: ${names}`)
    // Her last line stays up while she conducts and for a while after; then she is back to musing.
    const isRecent = isConducting || (scene.leader !== null && scene.now - scene.leader.at < 120_000)
    const work = scene.turn !== null && scene.turn.ask !== '' ? `${pd()}${scene.turn.to === undefined ? '' : ` → ${nameOf(scene.turn.to)}`}: ${scene.turn.ask}` : stage !== '' ? stage : scene.turn !== null ? carrying() : t('일을 기다리는 중', 'waiting for work')

    return {
      id,
      sub: t(`${member.remini} · ${member.title} · 리더`, `${member.name} · leader`),
      status: scene.turn !== null ? `${t('● 지휘 중', '● leading')} ${clock(scene.now - scene.turn.startedAt)}` : busy.length > 0 ? t('● 지휘 중', '● leading') : idleMark(),
      tint: undefined,
      isIdle: !isConducting,
      work,
      quote: isRecent ? (scene.leader?.quote ?? LEADER.idle) : say('woni', 'idle', musing('woni', scene.now), '지휘'),
      note: isRecent ? (scene.leader?.note ?? '') : '',
      // Who is on stage is said once: where the row above already says it, this one keeps the day's count.
      last: mine !== undefined && isFresh(mine, scene.now) ? `▸ ${mine.phrase}` : scene.turn !== null && stage !== '' && work !== stage ? stage : tally(scene),
      isAtWork: isConducting,
      pulse: '',
    }
  }

  const active = scene.tasks.filter(task => task.member === id && isActive(task))
  const task = shownTask(scene.tasks, id)
  const role = roleIn(scene.cast, id)
  const sub = t(`${member.remini} · ${member.title} · ${role}`, `${member.name} · ${roleName(role)}`)

  const mine = scene.live[id]

  if (mine !== undefined && active.length === 0 && (isFresh(mine, scene.now) || task === undefined || (task.endedAt ?? 0) < mine.at)) {
    const isNow = isFresh(mine, scene.now)

    return {
      id,
      sub,
      status: isNow ? t('● 작업 중', '● working') : idleMark(),
      tint: undefined,
      isIdle: !isNow,
      work: t(`원이와 함께 ${role} · 이번 턴 ${mine.count}번`, `${roleName(role)} beside WONI · ${mine.count} this turn`),
      quote: say(id, isNow ? 'start' : 'idle', isNow ? mine.count : musing(id, scene.now), role),
      note: '',
      last: `${mine.running > 0 ? '▸' : mine.isFailed === true ? '✗' : '✓'} ${mine.phrase}`,
      isAtWork: isNow,
      pulse: '',
    }
  }
  if (task === undefined) {
    return { id, sub, status: idleMark(), tint: undefined, isIdle: true, work: t('맡은 일 없음', 'no task'), quote: say(id, 'idle', musing(id, scene.now), role), note: '', last: '', isAtWork: false, pulse: '' }
  }

  const engine = task.kind !== 'orca' ? task.engine : task.engine === '시연' ? demo() : `Orca ${task.engine}`
  const more = active.length > 1 ? t(` 외 ${active.length - 1}개`, ` +${active.length - 1} more`) : ''
  const idle = task.kind === 'orca' ? t('▸ Orca 작업자가 일하는 중 · 결과 파일을 기다려요', '▸ an Orca worker is on it · waiting for its result file') : starting()
  // A worker's own screen says what it is on; an agent's tool calls do.
  const doing = task.kind === 'orca' ? (task.detail === undefined ? idle : `▸ ${task.detail}`) : task.tool === undefined ? idle : `▸ ${task.detail ?? task.tool} · ${calls(task.toolCount)}`
  const back = task.report === undefined ? '' : `↳ ${task.report}`

  return {
    id,
    sub,
    status: `${MARK[task.status]} ${wordOf(task.status)} ${clock(elapsed(task, scene.now))}`,
    tint: TINT[task.status],
    isIdle: false,
    work: `${task.title}${more} · ${engine}`,
    quote: task.quote,
    note: task.note,
    last: isActive(task) ? doing : back,
    isAtWork: isActive(task),
    pulse: isActive(task) ? pulseOf(task, scene.now) : '',
  }
}

const CARDS = new WeakMap<Scene, readonly Card[]>()

/** The five cards of a scene, worked out once however many parts of a drawing ask. */
const cardsOf = (scene: Scene): readonly Card[] => {
  const made = CARDS.get(scene) ?? ORDER.map(id => cardOf(id, scene))

  CARDS.set(scene, made)

  return made
}

/**
 * A card's first row: her heart and name, who she is, and her state at the
 * right edge. Where a press opens her backstage the name is the button.
 */
const Head = (kit: Kit, card: Card, width: number): RenderElement => {
  const { Box, Text, Button } = kit
  const { press, hotkey } = card
  const named = press === undefined ? cells(nameOf(card.id)) + 2 : cells(nameOf(card.id)) + (hotkey === undefined ? 0 : 3)
  // No room for her state in words: its mark alone.
  const status = 2 + named + 1 + cells(card.status) > width ? card.status.slice(0, 1) : card.status
  const subRoom = width - 2 - named - 1 - cells(status) - 1

  return (
    <Box justifyContent="space-between" width={width}>
      <Box>
        {Heart(kit, card.id)}
        {press === undefined ? (
          Badge(kit, card.id)
        ) : (
          <Button key={`who-${card.id}`} plain {...(hotkey === undefined ? {} : { hotkey })} onPress={press}>
            {nameOf(card.id)}
          </Button>
        )}
        {subRoom >= 4 && <Text dimColor>{` ${fit(card.sub, subRoom)}`}</Text>}
      </Box>
      <Text color={card.tint} bold={!card.isIdle} dimColor={card.isIdle}>
        {status}
      </Text>
    </Box>
  )
}

/** What the card is looked at for: what she is doing, how it went, what she handed back; failing those, her task. */
const gist = (card: Card): string => (/^[▸✓✗↳]/.test(card.last) ? card.last : card.work)

/**
 * The line that says what she is doing: its mark in her color, its words in
 * the terminal's own, so it reads on a light screen as on a dark one.
 */
const Doing = ({ Text, isLight }: Kit, card: Card, width: number): RenderElement => (
  <Text wrap="truncate-end">
    <Text color={lineOf(card.id, isLight)} bold>
      {card.last.slice(0, 2)}
    </Text>
    <Text bold>{fit(card.last.slice(2), width - 2)}</Text>
  </Text>
)

const QuoteLine = ({ Text, isLight }: Kit, card: Card, width: number, withNote: boolean): RenderElement => {
  const quote = fit(`“${card.quote}”`, width)
  const noteRoom = width - cells(quote) - 1

  return (
    <Text wrap="truncate-end">
      <Text color={lineOf(card.id, isLight)} italic>
        {quote}
      </Text>
      {withNote && card.note !== '' && noteRoom >= 6 && <Text dimColor>{` ${fit(card.note, noteRoom)}`}</Text>}
    </Text>
  )
}

/** The whole card: her pixel icon beside four rows, framed in her color. */
const FullCard = (kit: Kit, card: Card, width: number, beat: number): RenderElement => {
  const { Box, Text, Raster } = kit
  const text = width - 4 - ICON_COLUMNS - 2
  // What she is doing this moment goes first, in her color: it is what the card is looked at for.
  const isDoing = card.last.startsWith('▸')

  return (
    <Box key={card.id} borderStyle="round" borderColor={lineOf(card.id, kit.isLight)} borderDimColor={!card.isAtWork} paddingX={1} width={width} gap={2}>
      <Raster key={`icon-${card.id}`} columns={ICON_COLUMNS} rows={ICON_ROWS} cells={card.isAtWork ? frameOf(card.id, beat, kit.isLight) : iconOf(card.id, kit.isLight)} />
      <Box flexDirection="column" width={text}>
        {Head(kit, card, text)}
        {isDoing && (
          <Box justifyContent="space-between" width={text}>
            {Doing(kit, card, text - (card.pulse === '' ? 0 : cells(card.pulse) + 1))}
            {card.pulse !== '' && <Text color={lineOf(card.id, kit.isLight)}>{card.pulse}</Text>}
          </Box>
        )}
        <Text dimColor={card.isIdle} wrap="truncate-end">
          {fit(card.work, text)}
        </Text>
        {QuoteLine(kit, card, text, true)}
        {!isDoing && (
          <Text dimColor={card.isIdle && !/^[✓✗]/.test(card.last)} wrap="truncate-end">
            {card.last === '' ? ' ' : fit(card.last, text)}
          </Text>
        )}
      </Box>
    </Box>
  )
}

/** The card without her icon, three rows tall: for a pane with less room. */
const PlainCard = (kit: Kit, card: Card, width: number): RenderElement => {
  const { Box, Text } = kit
  const text = width - 4

  return (
    <Box key={card.id} borderStyle="round" borderColor={lineOf(card.id, kit.isLight)} borderDimColor={!card.isAtWork} paddingX={1} flexDirection="column" width={width}>
      {Head(kit, card, text)}
      {card.last.startsWith('▸') ? (
        Doing(kit, card, text)
      ) : (
        <Text dimColor={card.isIdle} wrap="truncate-end">
          {fit(gist(card), text)}
        </Text>
      )}
      {QuoteLine(kit, card, text, true)}
    </Box>
  )
}

/** Two rows a member behind a bar of her color: for a pane a few rows tall. Her work has the row before her line does. */
const SlimCard = (kit: Kit, card: Card, width: number): RenderElement => {
  const { Box, Text } = kit
  const line = lineOf(card.id, kit.isLight)
  const room = width - 4
  const what = fit(gist(card), Math.max(room - 25, Math.min(room, 20)))
  const quoteRoom = room - cells(what) - 1
  const quote = quoteRoom >= 8 ? fit(`“${card.quote}”`, quoteRoom) : ''

  return (
    <Box key={card.id} flexDirection="column" width={width}>
      <Box width={width}>
        <Text color={line}>▌</Text>
        {Head(kit, card, width - 1)}
      </Box>
      <Text wrap="truncate-end">
        <Text color={line}>▌</Text>
        <Text dimColor={card.isIdle}>{`  ${what} `}</Text>
        <Text color={line} italic>
          {quote}
        </Text>
      </Text>
    </Box>
  )
}

export type Density = 'full' | 'plain' | 'slim'

/** The richest layout the room holds: icons, then framed cards, then two rows a member. */
export const densityOf = (scene: Scene, room: Room): Density => {
  const chrome = 3 + usageRows(scene)

  if (room.columns >= 50 && room.rows >= ORDER.length * (ICON_ROWS + 2) + chrome) return 'full'
  if (room.columns >= 36 && room.rows >= ORDER.length * 5 + chrome) return 'plain'

  return 'slim'
}

const CARD_ROWS: Record<Density, number> = { full: ICON_ROWS + 2, plain: 5, slim: 2 }

const demo = (): string => t('시연', 'demo')
const starting = (): string => t('▸ 시작하는 중', '▸ starting')

export const ago = (at: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - at) / 1000))

  if (seconds < 10) return t('방금', 'now')
  if (seconds < 60) return t(`${seconds}초 전`, `${seconds}s ago`)

  return seconds < 3600 ? t(`${Math.floor(seconds / 60)}분 전`, `${Math.floor(seconds / 60)}m ago`) : t(`${Math.floor(seconds / 3600)}시간 전`, `${Math.floor(seconds / 3600)}h ago`)
}

/** The stage log: the last lines the members said, newest first, as many as the rows left hold. */
const FeedCard = (kit: Kit, scene: Scene, width: number, lines: number): RenderElement => {
  const { Box, Text } = kit
  const inner = width - 4
  const shown = [...scene.feed].reverse().slice(0, lines)
  const champion = scene.cup[0] !== undefined && scene.cup[0].count >= 2 ? scene.cup[0] : undefined

  return (
    <Box borderStyle="round" borderColor="subtle" paddingX={1} flexDirection="column" width={width}>
      <Box justifyContent="space-between" width={inner}>
        <Text bold>{t('무대 로그', 'Stage log')}</Text>
        {champion !== undefined && (
          <Text dimColor wrap="truncate-end">
            {fit(t(`명대사 월드컵 1위 “${champion.quote}” ${champion.count}번`, `Quote cup #1 “${champion.quote}” ×${champion.count}`), inner - 10)}
          </Text>
        )}
      </Box>
      {shown.map((said, index) => {
        const when = ago(said.at, scene.now)
        const name = nameOf(said.member)
        const room = inner - 2 - 7 - cells(when) - 1
        const quote = fit(`“${said.quote}”`, room)
        const noteRoom = room - cells(quote) - 1

        return (
          <Box key={`${said.at}-${index}`} justifyContent="space-between" width={inner}>
            <Text wrap="truncate-end">
              {Heart(kit, said.member)}
              <Text>{pad(name, 7)}</Text>
              <Text color={lineOf(said.member, kit.isLight)} italic>
                {quote}
              </Text>
              {noteRoom >= 6 && <Text dimColor>{` ${fit(said.note, noteRoom)}`}</Text>}
            </Text>
            <Text dimColor>{when}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

/** The ribbon under the title: the five members' colors, side by side. */
const Ribbon = ({ Text, isLight }: Kit, width: number, stroke = '▀'): RenderElement => {
  const each = Math.floor(width / ORDER.length)

  return (
    <Text>
      {ORDER.map((id, index) => (
        <Text key={id} color={lineOf(id, isLight)}>
          {stroke.repeat(index === ORDER.length - 1 ? width - each * (ORDER.length - 1) : each)}
        </Text>
      ))}
    </Text>
  )
}

/** The pane: a card for every member, and the usage card beneath. */
/** The line under the stage in the wide header: how the session's work stands. */
const tagline = (scene: Scene): string => {
  const ended = scene.tasks.filter(task => !isActive(task))
  const failed = ended.filter(task => task.status === 'failed').length
  const running = scene.tasks.length - ended.length

  if (running === 0 && ended.length === 0) return '리센느 아세요?'

  return [running > 0 ? t(`진행 ${running}`, `${running} running`) : '', t(`완료 ${ended.length - failed}`, `${ended.length - failed} done`), failed > 0 ? t(`실패 ${failed}`, `${failed} failed`) : ''].filter(part => part !== '').join(' · ')
}

/** The members whose card shows them at work: the ones whose icon moves. */
export const moversOf = (scene: Scene): MemberId[] => cardsOf(scene).filter(card => card.isAtWork).map(card => card.id)

// ---- the backstage: one member, and what she has been doing

type Row = { text: string; tone: 'head' | 'now' | 'plain' | 'dim' }
type Part = { head: string; rows: readonly string[]; from: 'head' | 'tail' }

const kindOf = (task: Task): string => (task.kind === 'agent' ? t(`서브에이전트 ${task.engine}`, `subagent ${task.engine}`) : task.engine === '시연' ? demo() : `Orca ${task.engine}`)

const stepLine = (step: Step, now: number): string => `${pad(ago(step.at, now), 7)} ${step.text}`

/**
 * A member's backstage in rows: the task she is on or last took, what she
 * was told, what she is doing, then what she did call by call, what an Orca
 * worker's own screen says, and what she handed back. The lists share the
 * rows the room has left, the newest of each first.
 */
const backstage = (id: MemberId, scene: Scene, room: number): Row[] => {
  const top: Row[] = []
  const parts: Part[] = []
  const task = id === 'woni' ? undefined : shownTask(scene.tasks, id)
  const stepped = [...(scene.steps[id] ?? [])].reverse().map(step => stepLine(step, scene.now))

  if (id === 'woni') {
    const { turn } = scene
    const busy = scene.tasks.filter(isActive).map(one => `${nameOf(one.member)} · ${one.title} · ${wordOf(one.status)} ${clock(elapsed(one, scene.now))}`)

    if (turn === null) top.push({ text: t('받은 요청을 기다리는 중', 'waiting for a request'), tone: 'dim' })
    else {
      const to = turn.to === undefined ? '' : ` → ${nameOf(turn.to)}`

      top.push({ text: turn.ask === '' ? carrying() : `${pd()}${to}: ${turn.ask}`, tone: 'head' })
      top.push({ text: t(`지휘 ${clock(scene.now - turn.startedAt)}째`, `leading for ${clock(scene.now - turn.startedAt)}`), tone: 'dim' })
    }
    const ended = scene.tasks
      .filter(one => !isActive(one))
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .map(one => `${MARK[one.status]} ${nameOf(one.member)} · ${one.title} · ${spoken(elapsed(one, scene.now))}`)
    const said = [...scene.feed].reverse().filter(line => line.member === 'woni').map(line => `${pad(ago(line.at, scene.now), 7)} “${line.quote}” ${line.note}`)

    if (busy.length > 0) parts.push({ head: t('무대 위', 'On stage'), rows: busy, from: 'head' })
    if (ended.length > 0) parts.push({ head: t('끝난 무대 (최근부터)', 'Finished (newest first)'), rows: ended, from: 'head' })
    if (said.length > 0) parts.push({ head: t('원이가 한 말', 'What WONI said'), rows: said, from: 'head' })
  }
  if (task !== undefined) {
    const others = scene.tasks.filter(one => one.member === id).length - 1
    const peeked = scene.peek?.id === task.id ? scene.peek.lines : []
    const trail = [...(task.trail ?? [])].reverse().slice(isActive(task) ? 1 : 0).map(step => stepLine(step, scene.now))

    top.push({ text: t(`맡은 일: ${task.title}${others > 0 ? ` (외 ${others}건)` : ''}`, `Task: ${task.title}${others > 0 ? ` (+${others} more)` : ''}`), tone: 'head' })
    top.push({ text: `${kindOf(task)} · ${wordOf(task.status)} ${clock(elapsed(task, scene.now))} · ${calls(task.toolCount)}`, tone: 'dim' })
    if (task.brief !== undefined) top.push({ text: `${t('지시', 'Brief')}: ${task.brief}`, tone: 'plain' })
    if (isActive(task)) top.push({ text: task.tool !== undefined || task.detail !== undefined ? `▸ ${task.detail ?? task.tool}` : task.kind === 'orca' ? t('▸ Orca 작업자가 일하는 중', '▸ an Orca worker is on it') : starting(), tone: 'now' })
    else top.push({ text: `${MARK[task.status]} ${task.note}`, tone: 'plain' })
    if (trail.length > 0) parts.push({ head: t('한 일 (최근부터)', 'What she did (newest first)'), rows: trail, from: 'head' })
    if (peeked.length > 0) parts.push(isActive(task) ? { head: scene.peek?.isStale === true ? t('작업자 화면 (지금은 못 읽음 · 마지막으로 읽은 것)', "Worker's screen (unreadable now · as last read)") : t('작업자 화면 (지금)', "Worker's screen (now)"), rows: peeked, from: 'tail' } : { head: t('결과 파일', 'Result file'), rows: peeked, from: 'head' })
    else if (task.kind === 'orca' && isActive(task)) top.push({ text: task.live === undefined && task.term === undefined ? t('진행 화면이 없는 실행이에요 (Orca 탭으로 띄우면 보여요) · 결과 파일을 기다려요', 'This run has no screen to show (launch it in an Orca tab to see one) · waiting for its result file') : t('작업자 화면을 기다리는 중', "waiting for the worker's screen"), tone: 'dim' })
    else if (!isActive(task) && task.summary !== undefined) parts.push({ head: t('보고', 'Report'), rows: task.summary, from: 'head' })
    else if (!isActive(task) && task.report !== undefined) top.push({ text: `↳ ${task.report}`, tone: 'plain' })
  }
  if (stepped.length > 0) parts.push({ head: id === 'woni' ? t('지휘 기록 (최근부터)', 'Lead log (newest first)') : t('원이와 함께 한 일 (최근부터)', 'Done beside WONI (newest first)'), rows: stepped, from: 'head' })
  if (task === undefined && id !== 'woni' && stepped.length === 0) top.push({ text: t('아직 한 일이 없어요', 'Nothing done yet'), tone: 'dim' })
  top.push({ text: `${t('토큰', 'Tokens')}: ${spentLine(id, scene)}`, tone: 'dim' })

  // The rows left go round the lists a row at a time, so a short one is shown whole and none is left out.
  const give = parts.map(() => 0)
  let left = Math.max(0, room - top.length - parts.length)

  while (left > 0 && parts.some((part, index) => (give[index] ?? 0) < part.rows.length)) {
    for (const [index, part] of parts.entries()) {
      if (left === 0 || (give[index] ?? 0) >= part.rows.length) continue
      give[index] = (give[index] ?? 0) + 1
      left -= 1
    }
  }

  return [
    // Never more rows than the room has: what she is on comes first and is what stays.
    ...top.slice(0, Math.max(1, room)),
    ...parts.flatMap((part, index): Row[] => {
      const kept = give[index] ?? 0
      const rows = part.from === 'tail' ? part.rows.slice(-kept) : part.rows.slice(0, kept)

      return kept === 0 ? [] : [{ text: part.head, tone: 'head' }, ...rows.map((text): Row => ({ text, tone: 'plain' }))]
    }),
  ]
}

/** A member's backstage as plain lines: what `/rescene <멤버>` prints. */
export const backstageLines = (id: MemberId, scene: Scene, room: number): string[] => backstage(id, scene, room).map(row => row.text)

/** The row of names over a backstage: a press on one goes to hers, on 전체 back to the five cards. */
const Tabs = (kit: Kit, shown: MemberId, acts: Acts, width: number): RenderElement => {
  const { Box, Button } = kit
  const { pick } = acts

  if (pick === undefined) return <Box />
  // Too narrow for every name: the way back alone.
  const ids = width >= 50 ? ORDER : []

  return (
    <Box gap={1} width={width}>
      <Button key="who-all" plain hotkey="0" onPress={() => pick(null)}>
        {t('전체', 'All')}
      </Button>
      {ids.map((id, index) =>
        id === shown ? (
          <Button key={`who-${id}`} variant="primary" hotkey={String(index + 1)} onPress={() => pick(null)}>
            {nameOf(id)}
          </Button>
        ) : (
          <Button key={`who-${id}`} plain hotkey={String(index + 1)} onPress={() => pick(id)}>
            {nameOf(id)}
          </Button>
        ),
      )}
    </Box>
  )
}

const Backstage = (kit: Kit, scene: Scene, id: MemberId, isOn: boolean, room: Room, beat: number, acts: Acts): RenderElement => {
  const { Box, Text } = kit
  const width = Math.max(20, Math.min(room.columns, 84))
  const card = cardsOf(scene)[ORDER.indexOf(id)] ?? cardOf(id, scene)
  const isIconed = width >= 50 && room.rows >= 14
  const body = Math.max(3, room.rows - 3 - (isIconed ? ICON_ROWS + 2 : 5) - 2 - 1)
  const rows = backstage(id, scene, body)
  const line = lineOf(id, kit.isLight)

  return (
    <Box flexDirection="column" width={width}>
      <Box justifyContent="space-between" width={width}>
        <Text wrap="truncate-end">
          <Text backgroundColor={PINK} color="#000000" bold>
            {' RESCENE '}
          </Text>
          <Text bold>{t(` 백스테이지: ${nameOf(id)}`, ` Backstage: ${nameOf(id)}`)}</Text>
        </Text>
        <Text color={isOn ? pinkOf(kit.isLight) : undefined} dimColor={!isOn}>
          {isOn ? 'REMINE ♥' : t('꺼짐', 'off')}
        </Text>
      </Box>
      {Ribbon(kit, width)}
      {Tabs(kit, id, acts, width)}
      {isIconed ? FullCard(kit, card, width, beat) : PlainCard(kit, card, width)}
      <Box borderStyle="round" borderColor={line} paddingX={1} flexDirection="column" width={width}>
        {rows.map((row, index) =>
          row.tone === 'now' ? (
            <Text key={`row-${index}`} wrap="truncate-end">
              <Text color={line} bold>
                {row.text.slice(0, 2)}
              </Text>
              <Text bold>{fit(row.text.slice(2), width - 6)}</Text>
            </Text>
          ) : (
            <Text key={`row-${index}`} bold={row.tone === 'head'} color={row.tone === 'head' ? line : undefined} dimColor={row.tone === 'dim'} wrap="truncate-end">
              {fit(row.text, width - 4)}
            </Text>
          ),
        )}
      </Box>
      <Text dimColor wrap="truncate-end">
        {fit(width >= 50 ? t('0 전체 보기 · 1~5 멤버 · Esc 닫기', '0 all · 1-5 member · Esc close') : t('0 전체 보기 · Esc 닫기', '0 all · Esc close'), width)}
      </Text>
    </Box>
  )
}

const byHand = (): string => t('지금: 직접 설정', 'Now: set by you')

/** Who has which kind of work, as plain lines: what `/rescene role` prints. */
export const castLines = (cast: Cast): string[] => [
  isSameCast(cast, CAST) ? t('지금: 자동 (기본, 멤버 본래 포지션)', 'Now: auto (default, each member in her own position)') : byHand(),
  ...ROLES.map(role => `${pad(roleName(role), t(5, 9))}${MEMBERS[cast[role]].heart} ${pad(nameOf(cast[role]), 7)}${dutyOf(role)}`),
]

/** The screen the roles are set on: a press on a kind of work gives it to the member whose row it is in. */
const Casting = (kit: Kit, scene: Scene, isOn: boolean, room: Room, acts: Acts): RenderElement => {
  const { Box, Text, Button } = kit
  const width = Math.max(20, Math.min(room.columns, 84))
  const { setup, recast } = acts
  // A name and four kinds of work in columns, inside the frame.
  const isTable = recast !== undefined && width >= t(50, 66)
  const pink = pinkOf(kit.isLight)
  const isAuto = isSameCast(scene.cast, CAST)
  const notes = t(
    ['자동(기본): 멤버 본래 포지션대로, 일의 성격을 보고 모드가 맡깁니다.', '역할을 누르면 그 멤버가 맡고, 원래 맡던 멤버와 맞바꿉니다.', '다음 작업부터 적용되고, 다음 세션에도 그대로 남습니다.', '담당 멤버가 바쁘면 손이 빈 멤버가 대신 맡습니다.'],
    ['Auto (default): each member in her own position, cast by the kind of work.', 'Press a role and that member takes it, swapping with whoever had it.', 'It applies from the next task on, and stays for later sessions.', 'When the member for a role is busy, one with free hands takes it.'],
  )

  return (
    <Box flexDirection="column" width={width}>
      <Box justifyContent="space-between" width={width}>
        <Text wrap="truncate-end">
          <Text backgroundColor={PINK} color="#000000" bold>
            {' RESCENE '}
          </Text>
          <Text bold>{` ${setupLabel()}`}</Text>
        </Text>
        {width >= 40 && (
          <Text color={isOn ? pink : undefined} dimColor={!isOn}>
            {isOn ? 'REMINE ♥' : t('꺼짐', 'off')}
          </Text>
        )}
      </Box>
      {Ribbon(kit, width)}
      {setup !== undefined && (
        <Box gap={2} width={width}>
          <Button key="setup-close" plain hotkey="0" onPress={() => setup(false)}>
            {t('돌아가기', 'Back')}
          </Button>
          {recast !== undefined &&
            (isAuto ? (
              <Button key="cast-auto" variant="primary" hotkey="a" onPress={() => recast(null, '구현')}>
                {auto()}
              </Button>
            ) : (
              <Button key="cast-auto" plain hotkey="a" onPress={() => recast(null, '구현')}>
                {auto()}
              </Button>
            ))}
          <Text color={isAuto ? undefined : pink} dimColor={isAuto} wrap="truncate-end">
            {fit(isAuto ? t('지금: 자동 (기본)', 'Now: auto (default)') : byHand(), Math.max(0, width - 30))}
          </Text>
        </Box>
      )}
      <Box borderStyle="round" borderColor={pink} paddingX={1} flexDirection="column" width={width}>
        <Text wrap="truncate-end">
          {Heart(kit, 'woni')}
          <Text bold>{pad(nameOf('woni'), 8)}</Text>
          <Text dimColor>{fit(t('지휘 · 리더는 그대로', 'lead · the leader stays'), width - 14)}</Text>
        </Text>
        {WORKERS.map(id =>
          isTable ? (
            <Box key={`cast-${id}`}>
              <Box width={10}>
                {Heart(kit, id)}
                <Text bold>{nameOf(id)}</Text>
              </Box>
              {ROLES.map(role => (
                <Box key={`cell-${id}-${role}`} width={t(9, 13)}>
                  {scene.cast[role] === id ? (
                    <Button key={`cast-${id}-${role}`} variant="primary" onPress={() => recast(id, role)}>
                      {roleName(role)}
                    </Button>
                  ) : (
                    <Button key={`cast-${id}-${role}`} plain dimColor onPress={() => recast(id, role)}>
                      {roleName(role)}
                    </Button>
                  )}
                </Box>
              ))}
            </Box>
          ) : (
            <Text key={`cast-${id}`} wrap="truncate-end">
              {Heart(kit, id)}
              <Text bold>{pad(nameOf(id), 8)}</Text>
              <Text color={lineOf(id, kit.isLight)}>{roleName(roleIn(scene.cast, id))}</Text>
            </Text>
          ),
        )}
      </Box>
      <Box borderStyle="round" borderColor={pink} paddingX={1} flexDirection="column" width={width}>
        <Text color={pink} bold wrap="truncate-end">
          {fit(t('역할이 하는 일', 'What each role does'), width - 4)}
        </Text>
        {ROLES.map(role => (
          <Text key={`duty-${role}`} wrap="truncate-end">
            <Text bold>{pad(roleName(role), t(6, 9))}</Text>
            <Text color={lineOf(scene.cast[role], kit.isLight)}>{pad(nameOf(scene.cast[role]), 8)}</Text>
            <Text dimColor>{fit(dutyOf(role), width - 4 - t(14, 17))}</Text>
          </Text>
        ))}
      </Box>
      {notes.slice(0, Math.max(0, room.rows - 18)).map((note, index) => (
        <Text key={`note-${index}`} dimColor wrap="truncate-end">
          {fit(note, width)}
        </Text>
      ))}
      <Text dimColor wrap="truncate-end">
        {fit(isTable ? t('0 돌아가기 · a 자동 · /rescene role 리브 구현 · /rescene role auto', '0 back · a auto · /rescene role LIV build · /rescene role auto') : t('/rescene role 리브 구현 · /rescene role auto', '/rescene role LIV build · /rescene role auto'), width)}
      </Text>
    </Box>
  )
}

/** `beat` is the pose the moving icons are on, so a redraw lands on the frame the animation is at. */
export const drawPane = (kit: Kit, scene: Scene, isOn: boolean, room: Room, beat = 0, acts: Acts = {}): RenderElement => {
  const { Box, Text } = kit

  if (scene.isCasting) return Casting(kit, scene, isOn, room, acts)
  if (scene.focus !== null) return Backstage(kit, scene, scene.focus, isOn, room, beat, acts)
  // As wide as the pane is, never wider: a narrow one is drawn narrow, not cut off.
  const width = Math.max(20, Math.min(room.columns, 84))
  const density = densityOf(scene, { columns: width, rows: room.rows })
  const { pick, setup } = acts
  const withSetup = setup !== undefined && width >= 40
  const unit = unitOf(scene.tasks, Math.floor(scene.waveAt / 1000))
  const isBusy = scene.tasks.some(isActive)
  const stage = unit !== undefined ? t(`지금 무대: ${unit}`, `On stage now: ${unit}`) : isBusy ? t('지금 무대 위', 'On stage now') : scene.turn !== null ? t('원이 싱글코어 가동 중', 'WONI running single-core') : t('대기실', 'Green room')
  // Her name is the way into her backstage: a press on it, or its digit while the pane has the keys.
  const cards = cardsOf(scene).map((card, index): Card => (pick === undefined ? card : { ...card, hotkey: String(index + 1), press: () => pick(card.id) }))
  const draw = density === 'full' ? FullCard : density === 'plain' ? PlainCard : SlimCard
  const meters = metersOf(scene)
  const cardRows = 3 + ORDER.length * CARD_ROWS[density]
  // Every member's token line where the rows are there; only theirs who spent where they are not.
  const isWhole = density !== 'slim' && cardRows + usageRows(scene, true) <= room.rows
  const base = cardRows + (density === 'slim' ? 1 : usageRows(scene, isWhole))
  // The wordmark takes two rows more than the title line: only where they are spare after a few lines of log.
  const isGrand = density === 'full' && width >= LOGO.columns + 30 && room.rows - base >= 2 + 3 + Math.min(scene.feed.length, 3)
  const used = base + (isGrand ? 2 : 0)
  const logLines = density === 'slim' ? 0 : Math.min(scene.feed.length, 6, room.rows - used - 3)
  const { Raster, Button } = kit

  return (
    <Box flexDirection="column" width={width}>
      {isGrand ? (
        <Box justifyContent="space-between" width={width}>
          <Raster key="logo" columns={LOGO.columns} rows={LOGO.rows} cells={logoOf(kit.isLight)} />
          <Box flexDirection="column" width={width - LOGO.columns - 2}>
            <Box justifyContent="flex-end" width={width - LOGO.columns - 2}>
              <Text color={isOn ? pinkOf(kit.isLight) : undefined} dimColor={!isOn}>
                {isOn ? 'REMINE ♥' : t('꺼짐', 'off')}
              </Text>
            </Box>
            <Box justifyContent="flex-end" width={width - LOGO.columns - 2}>
              <Text bold wrap="truncate-end">
                {fit(stage, width - LOGO.columns - 2)}
              </Text>
            </Box>
            <Box justifyContent="flex-end" width={width - LOGO.columns - 2}>
              <Text dimColor wrap="truncate-end">
                {fit(tagline(scene), width - LOGO.columns - 2)}
              </Text>
            </Box>
          </Box>
        </Box>
      ) : (
        <Box justifyContent="space-between" width={width}>
          <Text wrap="truncate-end">
            <Text backgroundColor={PINK} color="#000000" bold>
              {' RESCENE '}
            </Text>
            <Text bold>{` ${fit(stage, width - 10 - (width >= 40 || !isOn ? 9 : 0))}`}</Text>
          </Text>
          {(width >= 40 || !isOn) && (
            <Text color={isOn ? pinkOf(kit.isLight) : undefined} dimColor={!isOn}>
              {isOn ? 'REMINE ♥' : t('꺼짐', 'off')}
            </Text>
          )}
        </Box>
      )}
      {Ribbon(kit, width)}
      {cards.map(card => draw(kit, card, width, beat))}
      {density === 'slim' ? (
        <Text dimColor wrap="truncate-end">
          {fit(meters.length === 0 ? t('사용량은 /rescene usage', 'Usage: /rescene usage') : meters.map(meter => `${meter.label} ${Math.round(meter.percent)}%`).join(' · '), width)}
        </Text>
      ) : (
        UsageCard(kit, scene, width, isWhole)
      )}
      {logLines >= 1 && FeedCard(kit, scene, width, logLines)}
      <Box gap={1} width={width}>
        {withSetup && (
          <Button key="setup" plain hotkey="r" onPress={() => setup(true)}>
            {setupLabel()}
          </Button>
        )}
        <Text dimColor wrap="truncate-end">
          {fit(pick === undefined ? t('/rescene usage · cup · clear · off · Esc 닫기', '/rescene usage · cup · clear · off · Esc close') : withSetup ? t('· 이름 누르면 활동 보기 (1~5) · /rescene usage · cup · off', '· press a name for her backstage (1-5) · /rescene usage · cup · off') : t('이름을 누르면 활동 보기 (1~5) · /rescene usage · cup · off', 'press a name for her backstage (1-5) · /rescene usage · cup · off'), width - (withSetup ? cells(setupLabel()) + 4 : 0))}
        </Text>
      </Box>
    </Box>
  )
}

// ---- plain text, for a command's answer and a surface with no colors

export const rosterLines = (scene: Scene): string[] =>
  ORDER.map(id => {
    const card = cardsOf(scene)[ORDER.indexOf(id)] ?? cardOf(id, scene)

    return `${MEMBERS[id].heart} ${nameOf(id)} (${roleName(roleIn(scene.cast, id))}) ${card.status}${card.isIdle ? '' : ` · ${card.work}`}`
  })

/** The usage as plain lines: what `/rescene usage` prints. */
export const usageLines = (scene: Scene): string[] => {
  const lines = metersOf(scene).map(meter => `${pad(meter.label, t(7, 8))}${bar(meter.percent)} ${meter.text}`)

  if (scene.usage?.usd !== undefined) lines.push(`${t('Claude 세션 비용', 'Claude session cost')} $${scene.usage.usd.toFixed(2)}`)

  lines.push(spentHead())
  for (const id of ORDER) lines.push(`${MEMBERS[id].heart} ${nameOf(id)}: ${spentLine(id, scene)}`)

  return lines
}
