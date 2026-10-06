// Regression tests from the second audit (gpt-6-astra, 2026-10-06): each failed before its fix.
import type { On } from 'claude-code'
import type { Cast, Task, Line, Said } from '../types'
import { expect, mock, test } from 'claude-code/testing'
import { cells } from '../hooks/view'
import { CAST, castOf, recast } from '../hooks/members'

const observe = (on: On) => {
  const state: Record<string, unknown> = {}
  on('state.set', async ($, e, next) => { const result = await next(e); if (result.value?.isSet) state[e.key] = e.value; return result })
  return state
}

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const SUBMIT = { wait: false, origin: { kind: 'composer' } } as const
const SPAWN = { tool_use_id: 'a', prompt: '점검', description: '메이: 일', subagentType: 'general-purpose', provider: { plugin: 'core', tier: 'core' }, parentModel: 'm', background: false, fork: false } as const
const BAND = { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 20, scroll: { offset: 0, bodyRows: 3 }, view: {} }
const PANE = { title: 'RESCENE', isFocused: true, bodyColumns: 30, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

test('rejected prompt must not consume the changed cast', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let drop = false
  const sent: string[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => {
    sent.push((e.context ?? []).join('\n'))
    return drop ? { drop: 'blocked by test' } : { text: e.text }
  })
  await $.prompt.submit({ text: '처음', ...SUBMIT })
  await $.command.run({ command: 'rescene', args: 'role 리브 구현', ...RUN })
  drop = true
  await $.prompt.submit({ text: '거절되는 요청', ...SUBMIT })
  drop = false
  await $.prompt.submit({ text: '다음 요청', ...SUBMIT })
  expect(sent[2]).toContain('[리센느 역할 변경]')
})

test('task slash commands must retain the selected recipient', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let sent = ''
  on('prompt.submit', ($, e) => { sent = (e.context ?? []).join('\n'); return { text: e.text } })
  await $.command.run({ command: 'rescene', args: 'to 원이', ...RUN })
  await $.prompt.submit({ text: '/goal 버튼을 수정해 줘', ...SUBMIT })
  expect(sent).toContain('맡기지 않고 주 세션이 직접 처리한다')
})

test('failed persistence must not replace a live cast with defaults on reload', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const state = observe(on)
  on('store.set', () => { throw new Error('disk full') })
  on('store.get', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.command.run({ command: 'rescene', args: 'role 리브 구현', ...RUN })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect((state.cast as Cast)?.구현).toBe('liv')
})

/** Cells a drawn node takes on its row: a Button with the brackets a marked one is drawn in, a Box with its gaps. */
const drawnCells = (node: any): number => {
  if (typeof node === 'string') return cells(node)
  if (node === null || typeof node !== 'object') return 0
  if (node.type === 'Button') return cells(node.props.label) + (node.props.variant === 'primary' && node.props.plain !== true ? 4 : 0)
  const kids: unknown[] = node.children ?? []
  const inner = kids.reduce<number>((sum, kid) => sum + drawnCells(kid), 0)

  return node.type === 'Box' ? inner + Number(node.props.gap ?? 0) * Math.max(0, kids.length - 1) : inner
}

test('the rows of names and of usage fit the width they are given, however narrow, drawn in full or small', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200000, percent: 20 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }, { kind: 'seven_day', percentUsed: 9 }], cost: { usd: 12.5 }, changed: ['context', 'rateLimits'] })
  for (const bodyColumns of [20, 30, 36, 40, 46, 50, 56, 66, 80, 90, 100, 113, 125, 140]) {
    for (const maxRows of [1, 2, 3, 6]) {
      const band = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns, maxRows, scroll: { offset: 0, bodyRows: maxRows } } })
      const rows = (await band.findAll({ type: 'Box' })).filter(box => box.props.flexDirection !== 'column' && box.props.gap !== undefined)

      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows.length).toBeLessThanOrEqual(maxRows)
      for (const row of rows) expect(drawnCells(row)).toBeLessThanOrEqual(bodyColumns)
      await band.unmount()
    }
  }
})

test('a backstage too narrow for the names offers only the way back, and says so', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  await $.command.run({ command: 'rescene', args: '리브', ...RUN })
  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await pane.find({ type: 'Button', key: 'who-may' })).toBeUndefined()
  expect(await pane.find({ type: 'Button', key: 'who-all' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '0 전체 보기 · Esc 닫기' })).toBeDefined()
  await pane.unmount()
})

test('denied agent tool must not enter history as completed', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const state = observe(on)
  on('agent.spawn', () => ({ model: 'm', agentId: 'agent-a' } as any))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('tool.call', () => ({ deny: 'no permission' }))
  await $.agent.spawn(SPAWN)
  await $.tool.call({ tool: 'Read', file_path: '/w/a.ts', agentId: 'agent-a' } as any)
  const tasks = (state.tasks as Task[]) ?? []
  expect(tasks[0]?.trail?.[0]?.text).toContain('거절')
})

test('one member does not receive votes for another member saying the same line', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const state = observe(on)
  let id = 0
  on('agent.spawn', () => ({ model: 'm', agentId: `agent-${++id}` }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  await $.agent.spawn(SPAWN)
  await $.agent.spawn({ ...SPAWN, tool_use_id: 'b', description: '리브: 일' })
  await $.turn.complete({ agentId: 'agent-1', turnId: 't1', reason: 'error', answer: '', isAborted: false, durationMs: 1 })
  await $.turn.complete({ agentId: 'agent-2', turnId: 't2', reason: 'error', answer: '', isAborted: false, durationMs: 1 })
  const cup = (state.cup as Line[]) ?? []
  expect(cup.filter(line => line.quote === '미음').map(line => [line.member, line.count])).toEqual([['may', 1], ['woni', 1]])
})

test('fresh idle usage speech must expire after linger time', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const state = observe(on)
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.advance(60_000)
  await $.session.measure({ changed: ['rateLimits'], context: { window: 200000, percent: 20 }, rateLimits: [{ kind: 'five_hour', percentUsed: 85 }] })
  // There is a line to age: the warning, said when the figures came.
  expect((state.ticker as Said | null)?.quote).toBe('전 총량의 법칙을 믿습니다.')
  expect((state.ticker as Said | null)?.at).toBe(61000)
  await clock.advance(60_000)
  const now = (state.now as number) ?? 0
  const said = state.ticker as Said | null
  expect(now - (said?.at ?? 0)).toBeGreaterThanOrEqual(45000)
})

test('inspect state calls for a normal tool and render', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let reads = 0, writes = 0
  on('state.get', async ($, e, next) => { reads++; return next(e) })
  on('state.set', async ($, e, next) => { writes++; return next(e) })
  on('tool.call', () => ({ result: { content: '' } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'test', turnId: 't1' })
  reads = 0; writes = 0
  await $.tool.call({ tool: 'Read', file_path: '/w/a.ts' })
  expect({ reads, writes }).toEqual({ reads: 6, writes: 3 })
  reads = 0; writes = 0
  const band = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 100 } })
  expect({ reads, writes }).toEqual({ reads: 21, writes: 0 })
  await band.unmount()
})

test('corrupt saved cast falls back to a complete default mapping', () => {
  for (const value of [null, undefined, [], 'bad', { 구현: 'woni' }, { ...CAST, 검토: 'may' }, { ...CAST, 조사: 'unknown' }]) expect(castOf(value)).toEqual(CAST)
  expect(castOf(recast(CAST, 'liv', '구현'))).toEqual({ 구현: 'liv', 검토: 'minami', 조사: 'may', 탐색: 'zena' })
})

test('changing roles preserves an already assigned task', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const state = observe(on)
  on('agent.spawn', () => ({ model: 'm', agentId: 'active' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('store.set', () => ({ value: undefined }))
  await $.agent.spawn({ ...SPAWN, description: '로그인 폼 구현' })
  await $.command.run({ command: 'rescene', args: 'role 리브 구현', ...RUN })
  expect((state.tasks as Task[])[0]).toMatchObject({ member: 'minami', role: '구현', status: 'running' })
})

test('tool and prompt pass through a state read exception', async ($, on) => {
  let toolCalls = 0, prompts = 0
  on('state.get', () => { throw new Error('simulated state failure') })
  on('tool.call', () => { toolCalls++; return { result: { content: 'ok' } } })
  on('prompt.submit', ($, e) => { prompts++; return { text: e.text } })
  await $.tool.call({ tool: 'Read', file_path: '/w/a.ts' })
  await $.prompt.submit({ text: '테스트', ...SUBMIT })
  expect({ toolCalls, prompts }).toEqual({ toolCalls: 1, prompts: 1 })
})

test('late fleet completion must remain silent after off', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  let release = (): void => undefined
  let entered = false
  const toasts: string[] = []
  on('ui.toast', ($, e) => { toasts.push(JSON.stringify(e)); return { value: undefined } })
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('fs.read', () => ({ value: '[리센느 멤버 배정]\n테스트' }))
  on('env.get', () => ({ value: '/home/test' }))
  on('tool.call', () => new Promise<{ result: { stdout: string; stderr: string } }>(resolve => {
    entered = true
    release = () => resolve({ result: { stdout: '', stderr: '' } })
  }))
  const pending = $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md' })
  await clock.settle()
  expect(entered).toBe(true)
  await $.command.run({ command: 'rescene', args: 'off', ...RUN })
  toasts.length = 0
  release()
  await pending
  expect(toasts).toEqual([])
})

test('a band drawn small is two rows at work (the stage, the names) and one at rest', { options: { bandStyle: 'compact' } }, async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.toast', () => ({ value: undefined }))
  const rest = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 100 } })

  expect((await rest.findAll({ type: 'Box' })).filter(box => box.props.flexDirection !== 'column' && box.props.gap !== undefined).length).toBe(1)
  await rest.unmount()
  await $.prompt.submit({ text: '작업', ...SUBMIT })
  await $.turn.start({ text: '작업', turnId: 't1' })
  const band = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 100, isWorking: true } })
  const root = (await band.findAll({ type: 'Box' }))[0]!
  expect(root.children.length).toBe(2)
  await band.unmount()
})

test('usage band distinguishes remaining context from used quota', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200000, percent: 20 }, rateLimits: [{ kind: 'five_hour', percentUsed: 20 }], changed: ['context', 'rateLimits'] })
  const band = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, bodyColumns: 130 } })
  expect((await band.find({ type: 'Text', text: /^배터리 / }))?.text).toContain('남음')
  expect((await band.find({ type: 'Text', text: /^5시간 / }))?.text).toContain('사용')
  await band.unmount()
})

