import { expect, test } from 'claude-code/testing'

import { ago, backstageLines, cells, densityOf, fit, isFresh, moversOf, spentLine } from '../hooks/view'
import type { Scene } from '../hooks/view'
import { CAST } from '../hooks/members'
import type { Live, Task } from '../types'

const scene = (patch: Partial<Scene> = {}): Scene => ({
  tasks: [],
  now: 100_000,
  waveAt: 0,
  leader: null,
  ticker: null,
  usage: null,
  leaderTokens: { fresh: 0, cached: 0, out: 0 },
  feed: [],
  cup: [],
  turn: null,
  live: {},
  steps: {},
  focus: null,
  peek: null,
  target: null,
  banked: {},
  cast: CAST,
  isCasting: false,
  ...patch,
})

const task = (member: Task['member'], status: Task['status'], patch: Partial<Task> = {}): Task => ({
  id: `${member}-${status}`,
  kind: 'agent',
  member,
  role: '구현',
  engine: 'general-purpose',
  title: '일',
  status,
  startedAt: 0,
  toolCount: 0,
  quote: '',
  note: '',
  ...patch,
})

const live = (at: number, patch: Partial<Live> = {}): Live => ({ phrase: '고치는 중: a.ts', at, running: 0, count: 3, ...patch })

test('a token line says what was spent, what is pending, or why there is nothing', () => {
  const tokens = { fresh: 200, cached: 800, out: 50 }

  expect(spentLine('liv', scene())).toBe('따로 맡은 일 없음')
  expect(spentLine('liv', scene({ tasks: [task('liv', 'done', { tokens })] }))).toBe('입력 200 · 캐시 800 · 출력 50')
  expect(spentLine('liv', scene({ tasks: [task('liv', 'done', { tokens: { ...tokens, usd: 0.456 } })] }))).toBe('입력 200 · 캐시 800 · 출력 50 · $0.46')
  expect(spentLine('liv', scene({ tasks: [task('liv', 'running')] }))).toBe('작업 중 1개는 끝나면 집계')
  expect(spentLine('liv', scene({ tasks: [task('liv', 'done', { tokens }), task('liv', 'running')] }))).toBe('입력 200 · 캐시 800 · 출력 50 · +1개 진행 중')
  expect(spentLine('liv', scene({ live: { liv: live(0) } }))).toBe('따로 맡은 일 없음 · 원이와 함께 3번')
  expect(spentLine('woni', scene({ live: { woni: live(0) } }))).toBe('따로 맡은 일 없음')
  expect(spentLine('liv', scene({ tasks: [task('liv', 'done')] }))).toBe('맡은 일은 있었지만 토큰 기록을 못 받음')
  expect(spentLine('woni', scene({ leaderTokens: { fresh: 5, cached: 0, out: 0 } }))).toBe('입력 5 · 캐시 0 · 출력 0')
})

test('a time ago is said in seconds, minutes, then hours', () => {
  const at = 1_000_000

  expect(ago(at, at)).toBe('방금')
  expect(ago(at, at + 9000)).toBe('방금')
  expect(ago(at, at + 10_000)).toBe('10초 전')
  expect(ago(at, at + 59_000)).toBe('59초 전')
  expect(ago(at, at + 60_000)).toBe('1분 전')
  expect(ago(at, at + 3_599_000)).toBe('59분 전')
  expect(ago(at, at + 3_600_000)).toBe('1시간 전')
  expect(ago(at, at - 5000)).toBe('방금')
})

test('a call is fresh while it runs and for six seconds after it ends', () => {
  expect(isFresh(live(1000, { running: 1 }), 1_000_000)).toBe(true)
  expect(isFresh(live(1000), 1000 + 5999)).toBe(true)
  expect(isFresh(live(1000), 1000 + 6000)).toBe(false)
  expect(isFresh(live(1000), 1000)).toBe(true)
})

test('the members at work are 원이 in a turn, those with tasks running, and those who just used a tool', () => {
  expect(moversOf(scene())).toEqual([])
  expect(moversOf(scene({ turn: { startedAt: 0, ask: '' } }))).toEqual(['woni'])
  expect(moversOf(scene({ tasks: [task('minami', 'running')] }))).toEqual(['woni', 'minami'])
  expect(moversOf(scene({ tasks: [task('minami', 'done')] }))).toEqual([])
  expect(moversOf(scene({ live: { may: live(100_000 - 1000) } }))).toEqual(['may'])
  expect(moversOf(scene({ live: { may: live(100_000 - 6000) } }))).toEqual([])
  expect(moversOf(scene({ turn: { startedAt: 0, ask: '' }, live: { zena: live(100_000) } }))).toEqual(['woni', 'zena'])
})

test('a room holds icons, then framed cards, then two rows a member', () => {
  expect(densityOf(scene(), { columns: 80, rows: 37 })).toBe('full')
  expect(densityOf(scene(), { columns: 80, rows: 36 })).toBe('plain')
  expect(densityOf(scene(), { columns: 50, rows: 37 })).toBe('full')
  expect(densityOf(scene(), { columns: 49, rows: 37 })).toBe('plain')
  expect(densityOf(scene(), { columns: 36, rows: 32 })).toBe('plain')
  expect(densityOf(scene(), { columns: 36, rows: 31 })).toBe('slim')
  expect(densityOf(scene(), { columns: 35, rows: 100 })).toBe('slim')
})

test("a member's backstage lists what she did newest first, and shares the rows between her record and the worker's screen", () => {
  const trail = Array.from({ length: 12 }, (_, index) => ({ at: 40_000 + index * 5000, text: `읽음: file${index}.ts` }))
  const working = task('zena', 'running', { kind: 'orca', engine: 'codex-scout', title: 'find-config', startedAt: 40_000, toolCount: 12, tool: 'Read', detail: '읽는 중: file11.ts', brief: '설정 파일 위치 찾기', trail, live: '/w/o.out.md.live.log' })
  const peek = { id: working.id, lines: Array.from({ length: 30 }, (_, index) => `▸ 실행: step ${index}`) }
  const lines = backstageLines('zena', scene({ tasks: [working], peek }), 16)

  expect(lines).toHaveLength(16)
  expect(lines[0]).toBe('맡은 일: find-config')
  expect(lines[1]).toBe('Orca codex-scout · 작업 중 1:00 · 도구 12회')
  expect(lines[2]).toBe('지시: 설정 파일 위치 찾기')
  expect(lines[3]).toBe('▸ 읽는 중: file11.ts')
  // The call under way is the line above, not the first of the record.
  expect(lines[lines.indexOf('한 일 (최근부터)') + 1]).toBe('10초 전 읽음: file10.ts')
  // The worker's screen is read from its end.
  expect(lines.at(-1)).toBe('▸ 실행: step 29')
  expect(backstageLines('may', scene(), 10)).toEqual(['아직 한 일이 없어요', '토큰: 따로 맡은 일 없음'])
  // A room of three rows gets three, what she is on first.
  expect(backstageLines('zena', scene({ tasks: [working], peek }), 3)).toEqual(lines.slice(0, 3))
})

test('a text is measured and cut by what the terminal draws as one: a joined emoji, a syllable of loose jamo', () => {
  expect(cells('한글')).toBe(4)
  expect(cells('\u1112\u1161\u11ab')).toBe(2)
  expect(cells('e\u0301')).toBe(1)
  expect(cells('👩‍💻')).toBe(2)
  expect(fit('👩‍💻abcd', 4)).toBe('👩‍💻a…')
  expect(fit('abc', 0)).toBe('')
})
