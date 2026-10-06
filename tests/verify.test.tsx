// Regression tests from the verification of v0.7.0 (gpt-6-astra, 2026-10-06): the ten that failed then, and those that held.
import type { On } from 'claude-code'
import type { Task, Cast } from '../types'
import { expect, mock, test } from 'claude-code/testing'
import { CAST, recast } from '../hooks/members'
import { doingOf } from '../hooks/voice'

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const SUBMIT = { wait: false, origin: { kind: 'composer' } } as const
const START = { cwd: '/w', surface: 'terminal', isInteractive: true } as const
const CMD = 'orca terminal create --command "fleet-run codex-hard --spec /w/a.md --out /w/o.md" --json'
const SPAWN = { tool_use_id: 'a', prompt: 'test', description: '메이: 일', subagentType: 'general-purpose', provider: { plugin: 'core', tier: 'core' }, parentModel: 'm', background: false, fork: false } as const
const observe = (on: On) => {
  const state: Record<string, unknown> = {}
  on('state.set', async ($, e, next) => { const r = await next(e); if (r.value?.isSet) state[e.key] = e.value; return r })
  return state
}
const common = (on: On, skip: string[] = []) => {
  if (!skip.includes('toast')) on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.blit', () => ({ value: {} }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  if (!skip.includes('store')) on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.delete', () => ({ value: undefined }))
}
const filesOf = (on: On, shell = '/bin/zsh') => {
  const files: Record<string, string> = { '/w/a.md': '[리센느 멤버 배정]\ntest' }
  on('env.get', ($, e) => ({ value: e.name === 'SHELL' ? shell : '/w' }))
  on('fs.read', ($, e) => { if (!(e.path in files)) throw Error('ENOENT'); return { value: files[e.path]! } })
  on('fs.stat', ($, e) => { if (!(e.path in files)) throw Error('ENOENT'); return { value: { kind: 'file' as const, size: files[e.path]!.length, mtimeMs: 100000, isLink: false } } })
  on('fs.exists', ($, e) => ({ value: e.path in files }))
  on('fs.write', ($, e) => { files[e.path] = e.text; return { value: undefined } })
  return files
}
const result = (stdout = '▸ 실행: rg hooks', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const launched = (stdout = '{"ok":true,"result":{"terminal":{"handle":"term_good"}}}') => ({ result: { stdout, stderr: '' } })

test('accepted prompt survives completion bookkeeping failure exactly once', async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on)
  let calls = 0
  on('state.set', { plugin: 'rescene', key: 'briefed' }, () => { throw Error('write fails') })
  on('prompt.submit', ($, e) => { calls++; return { text: e.text } })
  expect((await $.prompt.submit({ text: 'hello', ...SUBMIT })).text).toBe('hello')
  expect(calls).toBe(1)
})

test('role changed while prompt enters is told on next prompt', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on)
  const sent: string[] = []; let pause = false; let release = () => {}
  on('prompt.submit', ($, e) => {
    sent.push((e.context ?? []).join('\n'))
    if (pause) return new Promise<{text: string}>(resolve => { release = () => resolve({text: e.text}) })
    return { text: e.text }
  })
  await $.prompt.submit({ text: 'first', ...SUBMIT })
  await $.command.run({ command: 'rescene', args: 'role 리브 구현', ...RUN })
  pause = true
  const pending = $.prompt.submit({ text: 'second', ...SUBMIT })
  await clock.settle()
  await $.command.run({ command: 'rescene', args: 'role 제나 구현', ...RUN })
  pause = false; release(); await pending
  await $.prompt.submit({ text: 'third', ...SUBMIT })
  expect(sent[2]).toContain('[리센느 역할 변경]')
})

test('off during first prompt admission must preserve stand-down notice', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on)
  const sent: string[] = []; let release = () => {}
  on('prompt.submit', ($, e) => {
    sent.push((e.context ?? []).join('\n'))
    if (sent.length === 1) return new Promise<{text: string}>(resolve => { release = () => resolve({text: e.text}) })
    return { text: e.text }
  })
  const pending = $.prompt.submit({ text: 'first', ...SUBMIT })
  await clock.settle()
  await $.command.run({ command: 'rescene', args: 'off', ...RUN })
  release(); await pending
  await $.prompt.submit({ text: 'second', ...SUBMIT })
  expect(sent[1]).toContain('리센느 모드가 꺼졌다')
})

test('slash controls with arguments must not receive a work delegation', async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on)
  const sent: string[] = []
  on('prompt.submit', ($, e) => { sent.push((e.context ?? []).join('\n')); return { text: e.text } })
  await $.command.run({ command: 'rescene', args: 'to 원이', ...RUN })
  for (const text of ['/model opus', '/permissions default', '/compact focus on tests']) await $.prompt.submit({ text, ...SUBMIT })
  expect(sent.filter(text => text.includes('맡기지 않고 주 세션이 직접 처리한다')).length).toBe(0)
})

test('role auto after failed initial load must not restore stale stored roles', async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on, ['store']); const state = observe(on)
  let fails = true
  on('store.get', () => { if (fails) throw Error('temporarily unavailable'); return { value: recast(CAST, 'liv', '구현') } })
  await $.session.start(START)
  await $.command.run({ command: 'rescene', args: 'role auto', ...RUN })
  fails = false
  await $.session.start(START)
  expect((state.cast as Cast | undefined)?.구현 ?? CAST.구현).toBe('minami')
})

test('role auto after custom initial load survives reload', async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on, ['store']); const state = observe(on)
  on('store.get', () => ({ value: recast(CAST, 'liv', '구현') }))
  await $.session.start(START)
  await $.command.run({ command: 'rescene', args: 'role auto', ...RUN })
  await $.session.start(START)
  expect((state.cast as Cast).구현).toBe('minami')
})

test('asked to keep the screen, the wrapper leaves a path with a space alone and keeps the background flag', { options: { keepScreen: true } }, async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on); filesOf(on)
  const ran: {command: string; bg: boolean | undefined}[] = []
  on('tool.call', ($, e) => { if (e.tool === 'Bash') ran.push({command: e.command, bg: e.run_in_background}); return launched('') })
  await $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md --out "/w/output space.md"', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md --out /w/o.md', run_in_background: true })
  expect(ran[0]!.command).not.toContain('tee')
  expect(ran[1]!.command).toContain('tee')
  expect(ran.map(x => x.bg)).toEqual([true, true])
})

test('a shell that is neither bash nor zsh is not given the wrapper, asked or not', { options: { keepScreen: true } }, async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on); filesOf(on, '/bin/fish')
  let command = ''
  on('tool.call', ($, e) => { if (e.tool === 'Bash') command = e.command; return launched('') })
  await $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md --out /w/o.md' })
  expect(command).not.toContain('tee')
})

test('denied fleet call from agent must amend its history', async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on); filesOf(on); const state = observe(on)
  on('agent.spawn', () => ({ model: 'm', agentId: 'agent-a' } as any))
  on('tool.call', () => ({ deny: 'denied' }))
  await $.agent.spawn(SPAWN)
  await $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md --out /w/o.md', agentId: 'agent-a' } as any)
  expect((state.tasks as Task[]).find(x => x.id === 'agent-a')?.trail?.[0]?.text).toContain('거절')
})

test('off then on permits late completion notification', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on, ['toast']); filesOf(on)
  let release = () => {}; const toasts: unknown[] = []
  on('ui.toast', ($, e) => { toasts.push(e); return { value: undefined } })
  on('tool.call', () => new Promise<ReturnType<typeof launched>>(resolve => { release = () => resolve(launched('')) }))
  const pending = $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md' })
  await clock.settle()
  await $.command.run({ command: 'rescene', args: 'off', ...RUN })
  await $.command.run({ command: 'rescene', args: 'on', ...RUN })
  toasts.length = 0; release(); await pending
  expect(toasts.length).toBeGreaterThanOrEqual(1)
})

test('two terminals opened by one command: nothing says which answer is whose, so neither screen is read', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on)
  const asked: string[][] = []
  on('process.run', ($, e) => { asked.push([...e.argv]); return result() })
  on('tool.call', () => launched('{"ok":true,"result":{"terminal":{"handle":"term_unrelated"}}}\n{"ok":true,"result":{"terminal":{"handle":"term_good"}}}'))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'orca terminal create --command "printf harmless" --json; ' + CMD })
  await clock.advance(8000)
  expect(asked.length).toBe(0)
})

test('unrelated background stdout must not be a terminal handle', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on); const state = observe(on)
  on('tool.call', () => launched('{"handle":"term_unrelated"}'))
  on('process.run', () => result())
  await $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md --out /w/o.md', run_in_background: true })
  await clock.settle()
  expect((state.tasks as Task[])[0]?.term).toBeUndefined()
})

test('focused worker shares six-second screen read budget', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on)
  const asked: string[][] = []
  on('process.run', ($, e) => { asked.push([...e.argv]); return result() })
  on('tool.call', () => launched())
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: CMD })
  await $.command.run({ command: 'rescene', args: '미나미', ...RUN })
  expect(asked.length).toBe(1)
  asked.length = 0
  await clock.advance(60000)
  expect(asked.length).toBeGreaterThanOrEqual(8)
  expect(asked.length).toBeLessThanOrEqual(10)
})

test('normal worker stops polling after confirmed completion', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); const files = filesOf(on); const state = observe(on)
  let calls = 0
  on('process.run', () => { calls++; return result() })
  on('tool.call', () => launched())
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: CMD })
  await clock.advance(8000)
  expect(calls).toBeGreaterThanOrEqual(1)
  files['/w/o.md.meta.json'] = '{"exit_code":0}'
  await clock.advance(8000)
  expect((state.tasks as Task[])[0]?.status).toBe('done')
  calls = 0; await clock.advance(20000)
  expect(calls).toBe(0)
})

test('process failures do not preserve stale current activity', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on); const state = observe(on)
  let failed = false
  on('process.run', () => result(failed ? '' : '▸ 실행: first task', failed ? 1 : 0))
  on('tool.call', () => launched())
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: CMD })
  await clock.advance(8000)
  expect((state.tasks as Task[])[0]?.detail).toContain('first task')
  failed = true; await clock.advance(20000)
  expect((state.tasks as Task[])[0]?.detail).not.toContain('first task')
})

test('failed terminal launch is not tracked as a running worker', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on); const state = observe(on)
  on('tool.call', () => ({ ...launched(''), isError: true as const }))
  on('process.run', () => result())
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: CMD })
  await clock.advance(8000)
  expect((state.tasks as Task[])[0]?.status).toBe('failed')
})

test('doingOf handles blank, shell prefixes and long outputs', () => {
  expect(doingOf([])).toBe('')
  expect(doingOf(['prefix', '▸ 실행: /bin/bash -lc "echo ok"', 'waiting'])).toBe('실행: echo ok')
  expect(doingOf(['x'.repeat(500)]).length).toBe(120)
})

test('startup overlapping off must not re-enable completion notifications', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on, ['toast', 'store']); filesOf(on)
  let releaseTool = () => {}; let releaseStore = () => {}; const toasts: unknown[] = []
  on('ui.toast', ($, e) => { toasts.push(e); return { value: undefined } })
  on('store.get', () => new Promise<{value: undefined}>(resolve => { releaseStore = () => resolve({value: undefined}) }))
  on('tool.call', () => new Promise<ReturnType<typeof launched>>(resolve => { releaseTool = () => resolve(launched('')) }))
  const tool = $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md' })
  await clock.settle()
  const start = $.session.start(START)
  await clock.settle()
  await $.command.run({ command: 'rescene', args: 'off', ...RUN })
  releaseStore(); await start
  toasts.length = 0; releaseTool(); await tool
  expect(toasts.length).toBe(0)
})

test('usage expiry assertion has a real warning to expire', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); const state = observe(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.start(START)
  await clock.advance(60000)
  await $.session.measure({ changed: ['rateLimits'], context: { window: 200000, percent: 20 }, rateLimits: [{ kind: 'five_hour', percentUsed: 85 }] })
  expect(state.ticker).not.toBeUndefined()
  expect(state.ticker).not.toBeNull()
  expect((state.ticker as {at: number}).at).toBe(61000)
  await clock.advance(60000)
  expect((state.now as number) - (state.ticker as {at: number}).at).toBeGreaterThanOrEqual(45000)
})

test('unasked, a launch is run exactly as the person wrote it', async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on); filesOf(on)
  const ran: string[] = []
  on('tool.call', ($, e) => { if (e.tool === 'Bash') ran.push(e.command); return launched('') })
  await $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md --out /w/o.md' })
  expect(ran).toEqual(['fleet-run codex-hard --spec /w/a.md --out /w/o.md'])
})

test("a call open across a reload is kept while a turn is under way, and closed by its own end or the turn's", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); const state = observe(on)
  let release = () => {}
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', () => new Promise<{ result: string }>(resolve => { release = () => resolve({ result: 'ok' }) }) as any)
  await $.session.start(START)
  await $.turn.start({ text: 'a.ts 읽어 줘', turnId: 't1' })
  const call = $.tool.call({ tool: 'Read', file_path: '/w/a.ts', tool_use_id: 'still-running' } as any)
  await clock.settle()
  const open = (): number => Object.values((state.live ?? {}) as Record<string, { running: number }>).reduce((sum, one) => sum + one.running, 0)

  expect(open()).toBe(1)
  await $.session.start(START)
  expect(open()).toBe(1)
  release(); await call
  expect(open()).toBe(0)
  // A call still open when the turn ends is closed with it.
  void $.tool.call({ tool: 'Read', file_path: '/w/b.ts', tool_use_id: 'left-open' } as any)
  await clock.settle()
  expect(open()).toBe(1)
  await $.turn.complete({ answer: '끝', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(open()).toBe(0)
})

test('the launch as the fleet skill writes it (titled, more steps inside the quotes, the handle picked out by grep) is read by its own handle', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on); const state = observe(on)
  const asked: string[][] = []
  on('process.run', ($, e) => { asked.push([...e.argv]); return result('  ▸ 실행: /bin/zsh -lc "rg -n register hooks"\n  … 2분 경과') })
  on('tool.call', () => launched('"handle": "term_real-01"'))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: `orca terminal create --worktree "id:w1" --title "codex-hard: a" --command "cd /w && fleet-run codex-hard --no-browser --cwd /w --spec /w/a.md --out /w/o.md; echo '[fleet-run 끝]'" --json | grep -o '"handle": "[^"]*"'` })
  await clock.advance(8000)
  expect(asked.at(-1)).toEqual(['orca', 'terminal', 'read', '--terminal', 'term_real-01', '--screen'])
  expect((state.tasks as Task[])[0]?.detail).toBe('실행: rg -n register hooks')
})

test('a terminal that the command says it could not open leaves no worker waiting, and one opened beside steps run at once is not read by a guess', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on); const state = observe(on)
  const asked: string[][] = []
  let printed = '{"ok":false,"error":"no such worktree"}'
  on('process.run', ($, e) => { asked.push([...e.argv]); return result() })
  on('tool.call', () => ({ ...launched(printed), ...(printed.includes('false') ? { isError: true as const } : {}) }))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: CMD })
  expect((state.tasks as Task[])[0]?.status).toBe('failed')
  printed = '{"handle":"term_other"}\n{"handle":"term_good"}'
  await $.tool.call({ tool: 'Bash', command: 'orca terminal create --command "sleep 1" --json & ' + CMD })
  await clock.advance(8000)
  expect((state.tasks as Task[]).at(-1)?.term).toBeUndefined()
  expect(asked.length).toBe(0)
})
