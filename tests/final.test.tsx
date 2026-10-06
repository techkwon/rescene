// Regression tests from the last verification before publishing (gpt-6-astra, 2026-10-06): each failed on v0.7.1.
import type { On } from 'claude-code'
import type { Task } from '../types'
import { expect, mock, test } from 'claude-code/testing'

// The texts these tests read are the Korean ones: the language is pinned, whatever the machine's own.
const KO = { options: { language: 'ko' } }

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const SUBMIT = { wait: false, origin: { kind: 'composer' } } as const
const START = { cwd: '/w', surface: 'terminal', isInteractive: true } as const
const CMD = 'orca terminal create --command "fleet-run codex-hard --spec /w/a.md --out /w/o.md" --json'
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

test('redirected create cannot authenticate another printed handle', KO, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on)
  const asked: string[][] = []
  on('process.run', ($, e) => { asked.push([...e.argv]); return result() })
  on('tool.call', () => launched('{"handle":"term_unrelated"}'))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: `printf '%s\\n' '{"handle":"term_unrelated"}'; ${CMD} >/dev/null` })
  await clock.advance(8000)
  expect(asked.length).toBe(0)
})

test('a failing output filter does not mean terminal creation failed', KO, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); const files = filesOf(on); const state = observe(on)
  on('tool.call', () => ({ ...launched(''), isError: true as const }))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: CMD + " | grep 'NO_MATCH'" })
  files['/w/o.md.meta.json'] = '{"exit_code":0}'
  await clock.advance(8000)
  expect((state.tasks as Task[])[0]?.status).toBe('done')
})

test('stat failures invalidate the last live-file activity', { options: { language: 'ko', keepScreen: true } }, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); const files = filesOf(on); const state = observe(on)
  files['/w/o.md.live.log'] = '▸ 실행: old activity'
  on('tool.call', () => launched(''))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md --out /w/o.md', run_in_background: true })
  await clock.advance(8000)
  expect((state.tasks as Task[])[0]?.detail).toContain('old activity')
  delete files['/w/o.md.live.log']
  await clock.advance(60000)
  expect((state.tasks as Task[])[0]?.detail).toBeUndefined()
})

test('waiting worker is not polled through backstage', KO, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on); const state = observe(on)
  let calls = 0
  on('process.run', () => { calls++; return result() })
  on('tool.call', () => launched())
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: CMD.replace(' --out /w/o.md', '') })
  expect((state.tasks as Task[])[0]?.status).toBe('waiting')
  await $.command.run({ command: 'rescene', args: '미나미', ...RUN })
  calls = 0
  await clock.advance(60000)
  expect(calls).toBe(0)
})

test('a new terminal using the same task id must not reuse its predecessor screen', KO, async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on); filesOf(on); const state = observe(on)
  let handle = 'term_old'
  on('tool.call', () => launched(`{"handle":"${handle}"}`))
  on('process.run', ($, e) => result('▸ 실행: ' + e.argv[4]))
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: CMD, tool_use_id: 'reused' } as any)
  await $.command.run({ command: 'rescene', args: '미나미', ...RUN })
  expect((state.peek as {lines: string[]}).lines.join('\n')).toContain('term_old')
  handle = 'term_new'
  await $.tool.call({ tool: 'Bash', command: CMD, tool_use_id: 'reused' } as any)
  const who = (state.tasks as Task[])[0]!.member
  await $.command.run({ command: 'rescene', args: who, ...RUN })
  expect((state.peek as {lines: string[]}).lines.join('\n')).toContain('term_new')
})

test('off while startup reads isOn must win after the read resolves', KO, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on, ['toast']); filesOf(on)
  let releaseTool = () => {}; let releaseRead = () => {}; let pause = false; let captured = false
  const toasts: unknown[] = []
  on('ui.toast', ($, e) => { toasts.push(e); return { value: undefined } })
  on('state.get', async ($, e, next) => {
    const r = await next(e)
    if (pause && e.key === 'isOn') {
      pause = false; captured = true
      await new Promise<void>(resolve => { releaseRead = resolve })
    }
    return r
  })
  on('tool.call', () => new Promise<ReturnType<typeof launched>>(resolve => { releaseTool = () => resolve(launched('')) }))
  const call = $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --spec /w/a.md' })
  await clock.settle()
  pause = true
  const start = $.session.start(START)
  await clock.settle()
  expect(captured).toBe(true)
  await $.command.run({ command: 'rescene', args: 'off', ...RUN })
  releaseRead(); await start
  toasts.length = 0; releaseTool(); await call
  expect(toasts.length).toBe(0)
})

test('statusline generation is work for the selected recipient', KO, async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on)
  let sent = ''
  on('prompt.submit', ($, e) => { sent = (e.context ?? []).join('\n'); return { text: e.text } })
  await $.command.run({ command: 'rescene', args: 'to 원이', ...RUN })
  await $.prompt.submit({ text: '/statusline show model name in orange', ...SUBMIT })
  expect(sent).toContain('맡기지 않고 주 세션이 직접 처리한다')
})

test('local control voice off is not work for a recipient', KO, async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on)
  let sent = ''
  on('prompt.submit', ($, e) => { sent = (e.context ?? []).join('\n'); return { text: e.text } })
  await $.command.run({ command: 'rescene', args: 'to 원이', ...RUN })
  await $.prompt.submit({ text: '/voice off', ...SUBMIT })
  expect(sent).not.toContain('맡기지 않고 주 세션이 직접 처리한다')
})

test('who is on stage is said once on the card of the member who conducts', KO, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 }); common(on); filesOf(on)
  on('process.run', () => result())
  on('tool.call', () => launched())
  await $.session.start(START)
  // A turn with no ask of the person's to show, and her own last call no longer fresh.
  await $.tool.call({ tool: 'Bash', command: CMD })
  await clock.advance(8000)
  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: { title: 'RESCENE', isFocused: true, bodyColumns: 72, placement: 'inline', scroll: { offset: 0, bodyRows: 50 }, view: {} } })
  const said = (await pane.findAll({ type: 'Text' })).filter(text => text.text.includes('무대 위: '))

  expect(said.length).toBe(1)
  await pane.unmount()
})

test("a member's hand-back of her report reads as a report in her record, not as a tool's name", KO, async ($, on) => {
  mock.clock(on, { now: 1000 }); common(on); const state = observe(on)
  on('agent.spawn', () => ({ model: 'm', agentId: 'agent-a' } as any))
  on('tool.call', () => ({ result: 'ok' } as any))
  await $.agent.spawn({ tool_use_id: 'a', prompt: 'test', description: '메이: 일', subagentType: 'general-purpose', provider: { plugin: 'core', tier: 'core' }, parentModel: 'm', background: false, fork: false })
  await $.tool.call({ tool: 'SubagentHandback', agentId: 'agent-a' } as any)
  expect((state.tasks as Task[]).find(task => task.id === 'agent-a')?.trail?.at(-1)?.text).toBe('보고 올림')
})
