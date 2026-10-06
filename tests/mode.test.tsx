import type { AgentSpawnInput } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const SPAWN: AgentSpawnInput = {
  tool_use_id: 'toolu_1',
  prompt: '로그인 폼을 고쳐 줘.',
  description: '로그인 폼 구현',
  subagentType: 'general-purpose',
  provider: { plugin: 'core', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
}

const BAND = { hasSurvey: false, isWorking: true, maxRows: 3, bodyColumns: 100, scroll: { offset: 0, bodyRows: 3 }, view: {} }
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

test('a spawned subagent is handed to a member, who is told how to report', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const seen: AgentSpawnInput[] = []

  on('agent.spawn', ($, e) => {
    seen.push(e)

    return { model: 'claude-sonnet-5-5', agentId: `agent_${seen.length}` }
  })

  await $.agent.spawn(SPAWN)
  await $.agent.spawn({ ...SPAWN, tool_use_id: 'toolu_2', description: '리브: 바뀐 코드 다시 보기' })

  expect(seen[0]?.description).toBe('💙 미나미 · 로그인 폼 구현')
  expect(seen[0]?.prompt).toContain('로그인 폼을 고쳐 줘.')
  expect(seen[0]?.prompt).toContain('너는 지휘자 원이가 아니라 미나미다')
  expect(seen[1]?.description).toBe('♥ 리브 · 바뀐 코드 다시 보기')
  expect(seen[1]?.prompt).toContain('"허우 유레카!"')

  const band = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: BAND })

  expect(await band.find({ type: 'Text', text: 'RESCENE' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^(?:06즈|밍뿌즈) 출동$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^ 미나미 $/ })).toMatchObject({ props: { backgroundColor: '#2b99c4' } })
  expect(await band.find({ type: 'Text', text: /^ 리브 $/ })).toMatchObject({ props: { backgroundColor: '#000000', color: '#ffffff' } })
  await band.unmount()
})

test("a member's turn ending ends her task, with what it cost", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })

  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'agent_1' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.toast', () => ({ value: undefined }))

  await $.agent.spawn({ ...SPAWN, subagentType: 'Explore', description: '설정 파일 위치 찾기' })
  await clock.advance(65_000)
  await $.turn.complete({
    answer: '💜 제나: 찾았어요.',
    durationMs: 65_000,
    isAborted: false,
    turnId: 'turn_1',
    agentId: 'agent_1',
    reason: 'answer',
    usage: { input_tokens: 1200, output_tokens: 340, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 800, model: 'claude-haiku-4-5' },
  })

  const said = await $.command.run({ command: 'rescene', args: 'usage', ...RUN })

  expect(said.text).toContain('💜 제나: 입력 2천 · 캐시 5만 · 출력 340')

  const pane = await $.ui.mount({
    plugin: 'rescene',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'rescene',
    props: { title: 'RESCENE', isFocused: false, bodyColumns: 64, placement: 'dock', scroll: { offset: 0, bodyRows: 50 }, view: {} },
  })

  expect(await pane.find({ type: 'Text', text: /^✓ 끝 1:05$/ })).toMatchObject({ props: { color: 'success' } })
  expect(await pane.find({ type: 'Text', text: /탐색 끝 · 1분 5초/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /쩨로밍 · 신라공주/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^“오이쉬!”$/ })).toBeDefined()
  expect((await pane.findAll({ type: 'Raster' })).map(raster => raster.props.key)).toEqual(['logo', 'icon-woni', 'icon-liv', 'icon-minami', 'icon-may', 'icon-zena'])
  expect((await pane.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round')).toHaveLength(7)
  expect(await pane.find({ type: 'Text', text: /^↳ 찾았어요\.$/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^무대 로그$/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^1분 전$/ })).toBeDefined()
  await pane.unmount()
})

test('the main loop is told it conducts as 원이, until the mode is off', async ($, on) => {
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] }))

  const facts = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: ['Agent'], outputStyle: null, traits: [] } as const
  const composed = await $.prompt.compose(facts)

  expect(composed.sections.map(section => section.id)).toEqual(['intro', 'rescene:leader'])
  expect(composed.sections[1]?.text).toContain('리센느 리더 원이(WONI)')

  await $.command.run({ command: 'rescene', args: 'off', ...RUN })

  expect((await $.prompt.compose(facts)).sections.map(section => section.id)).toEqual(['intro'])
  await $.command.run({ command: 'rescene', args: 'on', ...RUN })
})

test('an Orca worker is handed to a member, voiced through a copy of its spec, and ended by its meta file', async ($, on) => {
  const clock = mock.clock(on, { now: 5000 })
  const files = new Map<string, string>([['/w/runs/a/find.spec.md', '# 작업지시\n설정 파일을 찾는다.']])
  const ran: string[] = []

  mock.env(on, { HOME: '/home/me' })
  on('fs.read', ($, e) => {
    const text = files.get(e.path)

    if (text === undefined) throw new Error('ENOENT')

    return { value: text }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)

    return { value: undefined }
  })
  on('fs.stat', ($, e) => {
    if (!files.has(e.path)) throw new Error('ENOENT')

    return { value: { kind: 'file' as const, size: 1, mtimeMs: clock.now(), isLink: false } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('tool.call', ($, e) => {
    if (e.tool === 'Bash') ran.push(e.command)

    return { result: { stdout: '', stderr: '' } }
  })

  const answer = await $.tool.call({
    tool: 'Bash',
    command: `ls /w/runs/a/find.spec.md; orca terminal create --title "scout" --command "fleet-run codex-scout --cwd /w --spec /w/runs/a/find.spec.md --out /w/runs/a/find.out.md; echo done" --json`,
  })

  expect(ran[0]).toContain('--spec /w/runs/a/find.spec.rescene-zena.md --out /w/runs/a/find.out.md')
  expect(ran[0]?.startsWith('ls /w/runs/a/find.spec.md; orca terminal create')).toBe(true)
  expect(files.get('/w/runs/a/find.spec.rescene-zena.md')).toContain('너는 지휘자 원이가 아니라 제나다')
  expect(files.get('/w/runs/a/find.spec.md')).toBe('# 작업지시\n설정 파일을 찾는다.')
  expect(answer.context?.join('\n')).toContain('[리센느 배정] fleet-run codex-scout "find" 작업은 제나(탐색)가 맡았다.')

  const before = await $.command.run({ command: 'rescene', args: '', ...RUN })

  expect(before.text).toContain('💜 제나 (탐색) ● 작업 중')

  files.set('/w/runs/a/find.out.md.meta.json', JSON.stringify({ exit_code: 0, model: 'gpt-6-luna', seconds: 43, usage: { input_tokens: 249_829, cached_input_tokens: 195_072, output_tokens: 1095 } }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.advance(4000)

  const after = await $.command.run({ command: 'rescene', args: 'usage', ...RUN })

  expect(after.text).toContain('💜 제나: 입력 5.5만 · 캐시 19.5만 · 출력 1.1천')
})

test('a pane with little room draws two rows a member, and a roomy one her framed card', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const props = { title: 'RESCENE', isFocused: false, bodyColumns: 44, placement: 'inline', scroll: { offset: 0, bodyRows: 14 }, view: {} } as const
  const slim = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props })

  expect(await slim.findAll({ type: 'Raster' })).toHaveLength(0)
  expect(await slim.findAll({ type: 'Text', text: /^▌$/ })).toHaveLength(10)
  expect(await slim.find({ type: 'Button', key: 'who-liv' })).toMatchObject({ props: { label: '리브', hotkey: '2' } })
  await slim.unmount()

  const plain = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: { ...props, scroll: { offset: 0, bodyRows: 34 } } })

  expect(await plain.findAll({ type: 'Raster' })).toHaveLength(0)
  expect((await plain.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round')).toHaveLength(6)
  expect((await plain.findAll({ type: 'Box' })).filter(box => box.props.borderColor === 'text')).toHaveLength(1)
  await plain.unmount()
})

test('the main loop is told beside the first typed prompt that it conducts, once, and told when the mode goes off', async ($, on) => {
  const seen: (readonly string[] | undefined)[] = []

  on('prompt.submit', ($, e) => {
    seen.push(e.context)

    return { text: e.text }
  })

  const typed = { text: '안녕', wait: false, origin: { kind: 'composer' } } as const

  await $.prompt.submit(typed)
  await $.prompt.submit(typed)
  await $.command.run({ command: 'rescene', args: 'off', ...RUN })
  await $.prompt.submit(typed)
  await $.prompt.submit(typed)

  expect(seen[0]?.[0]).toContain('리센느 리더 원이(WONI)')
  expect(seen[1]).toBeUndefined()
  expect(seen[2]?.[0]).toContain('리센느 모드가 꺼졌다')
  expect(seen[3]).toBeUndefined()
  await $.command.run({ command: 'rescene', args: 'on', ...RUN })
})

test('the beat ends a member the engine lists as done, and has a slow one say so', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const listed = [{ id: 'agent_1', description: '💙 미나미 · 로그인 폼 구현', type: 'general-purpose', status: 'running' as 'running' | 'completed' }]
  const opened: string[] = []

  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'agent_1' }))
  on('agent.list', () => ({ value: listed }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', ($, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true as const } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(SPAWN)
  await clock.settle()

  expect(opened).toEqual(['rescene'])

  await clock.advance(184_000)

  const slow = await $.command.run({ command: 'rescene', args: '', ...RUN })

  expect(slow.text).toContain('💙 미나미 (구현) ● 작업 중 3:0')

  const pane = await $.ui.mount({
    plugin: 'rescene',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'rescene',
    props: { title: 'RESCENE', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 52 }, view: {} },
  })

  expect(await pane.find({ type: 'Text', text: /^“오이데 오이데~ 마떼루요~”$/ })).toBeDefined()
  await pane.unmount()

  const first = listed[0]

  if (first !== undefined) first.status = 'completed'
  await clock.advance(4000)

  const done = await $.command.run({ command: 'rescene', args: '', ...RUN })

  expect(done.text).toContain('💙 미나미 (구현) ✓ 끝')
})

const PANE = { title: 'RESCENE', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 52 }, view: {} } as const

test("the main session's own tool calls show on the card of the member whose kind of work they are", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  let release = (): void => undefined

  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.blit', () => ({ value: {} }))
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.word}</Text>
  })
  on('tool.call', () => new Promise<{ result: { stdout: string; stderr: string } }>(resolve => {
    release = () => resolve({ result: { stdout: '', stderr: '' } })
  }))

  await $.turn.start({ text: '로그인 폼이 왜 깨지는지 봐 줘\n자세히', turnId: 'turn_1' })

  const call = $.tool.call({ tool: 'Bash', command: 'tsc -p .', description: '타입 검사' })

  await clock.settle()

  const during = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await during.find({ type: 'Text', text: /^피디니무: 로그인 폼이 왜 깨지는지 봐 줘$/ })).toBeDefined()
  expect(await during.find({ type: 'Text', text: /^▸ 실행 중: 타입 검사$/ })).toBeDefined()
  expect(await during.find({ type: 'Text', text: /^원이와 함께 검토 · 이번 턴 1번$/ })).toBeDefined()
  expect(await during.find({ type: 'Text', text: /^ ?원이 싱글코어 가동 중$/ })).toBeDefined()
  await during.unmount()

  const spinner = await $.ui.mount({
    plugin: 'rescene',
    surface: 'terminal',
    component: 'Spinner',
    props: { mode: 'tool-use', word: 'Working', message: null, suffix: '' },
  })

  expect(await spinner.find({ text: /리브 실행 중: 타입 검사/ })).toBeDefined()
  await spinner.unmount()

  release()
  await call

  const after = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await after.find({ type: 'Text', text: /^✓ 실행함: 타입 검사$/ })).toBeDefined()
  await after.unmount()
})

test('the icons of the members at work move, and one whose task ended well hops, then stands still', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const painted: { key: string; cells: string }[] = []

  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'agent_1' }))
  on('agent.list', () => ({ value: [{ id: 'agent_1', description: '💙 미나미 · 로그인 폼 구현', type: 'general-purpose', status: 'running' as const }] }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.blit', ($, e) => {
    if ('cells' in e) painted.push({ key: e.key, cells: e.cells })

    return { value: {} }
  })

  await $.agent.spawn(SPAWN)

  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })
  const still = (await pane.findAll({ type: 'Raster' })).find(raster => raster.props.key === 'icon-liv')?.props.cells

  await clock.advance(1000)

  const moved = new Set(painted.map(one => one.key))

  expect([...moved].sort()).toEqual(['icon-minami', 'icon-woni'])
  expect(new Set(painted.filter(one => one.key === 'icon-minami').map(one => one.cells)).size).toBeGreaterThan(1)
  expect(still).toBeDefined()

  await $.turn.complete({ answer: '💙 미나미: 다 고쳤어요.', durationMs: 4000, isAborted: false, turnId: 'turn_2', agentId: 'agent_1', reason: 'answer' })
  await pane.unmount()

  const rested = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  painted.length = 0
  await clock.advance(1000)
  expect(painted.some(one => one.key === 'icon-minami')).toBe(true)

  await clock.advance(4000)
  painted.length = 0
  await clock.advance(1000)
  expect(painted).toEqual([])
  await rested.unmount()
})

test('a command that only mentions a launch reserves nobody, and one that writes its spec first does', async ($, on) => {
  mock.clock(on, { now: 1000 })
  mock.env(on, { HOME: '/home/me' })
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('fs.stat', () => {
    throw new Error('ENOENT')
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '' } }))

  const talk = await $.tool.call({ tool: 'Bash', command: 'echo "fleet-run codex-build --spec /w/none.spec.md --out /w/none.out.md"' })

  expect(talk.context).toBeUndefined()

  const made = await $.tool.call({
    tool: 'Bash',
    command: 'echo "# 작업" > /w/new.spec.md\nfleet-run codex-scout --cwd /w --spec /w/new.spec.md --out /w/new.out.md',
    run_in_background: true,
  })

  expect(made.context?.join('\n')).toContain('"new" 작업은 제나(탐색)가 맡았다.')
})

test('of two calls running at once the card keeps the one still running, and off mid-turn clears the stage', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const releases = new Map<string, () => void>()

  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.blit', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('tool.call', ($, e) => new Promise<{ result: { stdout: string; stderr: string } }>(resolve => {
    releases.set(e.tool === 'Bash' ? e.command : '', () => resolve({ result: { stdout: '', stderr: '' } }))
  }))

  await $.turn.start({ text: '검사해 줘', turnId: 'turn_1' })

  const first = $.tool.call({ tool: 'Bash', command: 'tsc -p .', description: '타입 검사' })

  await clock.settle()

  const second = $.tool.call({ tool: 'Bash', command: 'npm test', description: '단위 테스트' })

  await clock.settle()
  releases.get('npm test')?.()
  await second

  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await pane.find({ type: 'Text', text: /^▸ 실행 중: 타입 검사$/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^원이와 함께 검토 · 이번 턴 2번$/ })).toBeDefined()
  await pane.unmount()

  await $.command.run({ command: 'rescene', args: 'off', ...RUN })
  releases.get('tsc -p .')?.()
  await first
  await $.turn.complete({ answer: '끝', durationMs: 1000, isAborted: false, turnId: 'turn_1', reason: 'answer' })
  await $.command.run({ command: 'rescene', args: 'on', ...RUN })

  const after = await $.command.run({ command: 'rescene', args: '', ...RUN })

  expect(after.text).toContain('💚 원이 (지휘) ○ 대기')
})

test('a tool call with no turn start seen still shows 원이 conducting, and a message typed mid-turn becomes the ask', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })

  on('ui.blit', () => ({ value: {} }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => new Promise<{ result: { stdout: string; stderr: string } }>(() => undefined))

  void $.tool.call({ tool: 'Bash', command: 'ls src', description: '' })
  await clock.settle()

  const before = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await before.find({ type: 'Text', text: /^● 지휘 중 0:00$/ })).toBeDefined()
  expect(await before.find({ type: 'Text', text: /^이어서 작업하는 중$/ })).toBeDefined()
  await before.unmount()

  await $.prompt.submit({ text: '애니메이션도 넣어 줘', wait: false, origin: { kind: 'composer' } })

  const after = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await after.find({ type: 'Text', text: /^피디니무: 애니메이션도 넣어 줘$/ })).toBeDefined()
  await after.unmount()
})

test('a moment in the session gets its line once: the limit nearly spent, the same file read again and again', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const toasts: string[] = []
  let percentUsed = 82

  on('ui.toast', ($, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.blit', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 1_000_000, tokens: 100_000, percent: 10 }, rateLimits: [{ kind: 'five_hour', percentUsed }] },
  }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { content: '' } }))

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(toasts.filter(text => text.includes('전 총량의 법칙을 믿습니다.'))).toHaveLength(1)

  percentUsed = 96
  await $.command.run({ command: 'rescene', args: 'usage', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  await $.command.run({ command: 'rescene', args: 'usage', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(toasts.filter(text => text.includes('그냥 굶어라.'))).toHaveLength(1)
  expect(toasts.filter(text => text.includes('전 총량의 법칙을 믿습니다.'))).toHaveLength(1)

  await $.turn.start({ text: '봐 줘', turnId: 'turn_1' })
  for (let time = 0; time < 7; time += 1) await $.tool.call({ tool: 'Read', file_path: '/w/src/view.tsx' })
  expect(toasts.filter(text => text.includes('그만 좀 봅시다.'))).toEqual(['💚 원이 “와 이래 많이 봅니까, 우리? 그만 좀 봅시다.” view.tsx, 이번 턴에만 5번째 읽어요'])
})

test('every line said is a vote in the 명대사 월드컵, and /rescene cup ranks them', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let spawned = 0

  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `agent_${(spawned += 1)}` }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.blit', () => ({ value: {} }))

  await $.agent.spawn({ ...SPAWN, description: '미나미: 폼 구현' })
  await $.agent.spawn({ ...SPAWN, tool_use_id: 'toolu_2', description: '미나미: 폼 구현 하나 더' })
  await $.agent.spawn({ ...SPAWN, tool_use_id: 'toolu_3', description: '미나미: 폼 구현 또 하나' })

  const ranked = await $.command.run({ command: 'rescene', args: 'cup', ...RUN })

  expect(ranked.text).toContain('명대사 월드컵')
  expect(ranked.text).toContain('1위 💙 미나미 “쿄 아손데콩!” 2번')

  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await pane.find({ type: 'Text', text: /^명대사 월드컵 1위 “쿄 아손데콩!” 2번$/ })).toBeDefined()
  await pane.unmount()
})

const DOCK = { title: 'RESCENE', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 52 }, view: {} } as const

test("a press on a member's name opens her backstage: what she was told, what she did, what she handed back", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })

  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'agent_1' }))
  on('agent.list', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', () => ({ result: { content: '' } }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.agent.spawn({ ...SPAWN, description: '리브: 바뀐 코드 다시 보기', prompt: '# 바뀐 코드를 다시 봐 줘\n자세히.' })
  // Beside 원이, in the main session: 제나 reads, and it is on her record.
  await $.tool.call({ tool: 'Read', file_path: '/w/hooks/view.tsx' })
  await clock.advance(20_000)

  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: DOCK })

  expect(await pane.find({ type: 'Button', key: 'who-liv' })).toMatchObject({ props: { label: '리브', hotkey: '2' } })
  await pane.press({ key: 'who-liv' })

  expect(await pane.find({ type: 'Text', text: ' 백스테이지: 리브' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '맡은 일: 바뀐 코드 다시 보기' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '지시: 바뀐 코드를 다시 봐 줘' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^서브에이전트 general-purpose · 작업 중 0:\d\d · 도구 0회$/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '시작하는 중' })).toBeDefined()
  // Only her icon is drawn there, and it is the one that moves.
  expect((await pane.findAll({ type: 'Raster' })).map(raster => raster.props.key)).toEqual(['icon-liv'])

  await $.turn.complete({ turnId: 't1', agentId: 'agent_1', reason: 'answer', isAborted: false, answer: '♥ 리브: 허우 유레카!\n결론: 문제 두 곳을 찾았어요.\n- view.tsx 12줄\n- register.tsx 40줄', durationMs: 20_000 })
  expect(await pane.find({ type: 'Text', text: '보고' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '결론: 문제 두 곳을 찾았어요.' })).toBeDefined()

  const said = await $.command.run({ command: 'rescene', args: '리브', ...RUN })

  expect(said.text).toContain('♥ 리브 백스테이지')
  expect(said.text).toContain('- view.tsx 12줄')

  // Another member's, by her name in the row over it: what 제나 did beside 원이.
  await pane.press({ key: 'who-zena' })
  expect(await pane.find({ type: 'Text', text: '원이와 함께 한 일 (최근부터)' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^20초 전 읽음: view\.tsx$/ })).toBeDefined()

  // The way back: 전체, or her own name again.
  await pane.press({ key: 'who-all' })
  expect(await pane.find({ type: 'Text', text: ' 백스테이지: 리브' })).toBeUndefined()
  expect(await pane.findAll({ type: 'Raster' })).toHaveLength(6)
  await pane.unmount()
})

test('the band names who takes the next prompt: a press picks her, and the prompt is handed to her', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const sent: { text: string; context?: readonly string[] }[] = []

  on('prompt.submit', ($, e) => {
    sent.push(e)

    return { text: e.text }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, percent: 37, tokens: 74_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 41 }, { kind: 'seven_day', percentUsed: 12 }], cost: { usd: 1.5 } },
  }))

  await $.command.run({ command: 'rescene', args: 'usage', ...RUN })

  const band = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, isWorking: false, bodyColumns: 130 } })

  // Idle, drawn in full: a rule, the row of names with 자동 marked, the usage as bars on a row of its own.
  expect(await band.find({ type: 'Text', text: '받는 멤버' })).toBeDefined()
  expect(await band.find({ type: 'Button', key: 'aim-auto' })).toMatchObject({ props: { label: '자동', variant: 'primary' } })
  expect(await band.find({ type: 'Button', key: 'aim-woni' })).toMatchObject({ props: { label: '원이', plain: true } })
  expect(await band.find({ type: 'Text', text: '→ 원이가 나눠 맡김' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: ' 검토' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: '▂'.repeat(26) })).toBeDefined()
  expect(await band.find({ type: 'Text', text: ' ▰▰▰▰▰▰▱▱▱▱' })).toBeDefined()
  expect((await band.find({ type: 'Text', text: /^배터리 / }))?.text).toBe('배터리 ▰▰▰▰▰▰▱▱▱▱ 63% 남음')
  expect((await band.find({ type: 'Text', text: /^5시간 / }))?.text).toBe('5시간 ▰▰▰▰▱▱▱▱▱▱ 41% 사용')
  expect(await band.find({ type: 'Text', text: '$1.50' })).toBeDefined()
  // No digit of its own: a number typed into an empty prompt stays a number.
  expect((await band.find({ type: 'Button', key: 'aim-minami' }))?.props.hotkey).toBeUndefined()

  await band.press({ key: 'aim-minami' })
  expect(await band.find({ type: 'Button', key: 'aim-minami' })).toMatchObject({ props: { variant: 'primary' } })
  expect(await band.find({ type: 'Text', text: '→ 다음 명령은 미나미에게' })).toBeDefined()

  await $.prompt.submit({ text: '로그인 폼 고쳐 줘', wait: false, origin: { kind: 'composer' } })

  const told = (sent[0]?.context ?? []).join('\n')

  expect(told).toContain('[리센느 지명]')
  expect(told).toContain('description을 "미나미: "로 시작')

  // Her name again, or 자동, names nobody: the default.
  await band.press({ key: 'aim-minami' })
  expect(await band.find({ type: 'Button', key: 'aim-auto' })).toMatchObject({ props: { variant: 'primary' } })
  await $.prompt.submit({ text: '고마워', wait: false, origin: { kind: 'composer' } })
  expect((sent[1]?.context ?? []).join('\n')).not.toContain('[리센느 지명]')

  // 원이 named: she does it herself, handing nothing on.
  await band.press({ key: 'aim-woni' })
  expect(await band.find({ type: 'Text', text: '→ 원이가 직접 처리' })).toBeDefined()
  await $.prompt.submit({ text: '이건 직접 해 줘', wait: false, origin: { kind: 'composer' } })
  expect((sent[2]?.context ?? []).join('\n')).toContain('맡기지 않고 주 세션이 직접 처리한다')
  expect((await $.command.run({ command: 'rescene', args: 'to 자동', ...RUN })).text).toContain('자동으로 돌렸어요')
  expect(await band.find({ type: 'Button', key: 'aim-auto' })).toMatchObject({ props: { variant: 'primary' } })

  expect((await $.command.run({ command: 'rescene', args: 'to 리브', ...RUN })).text).toContain('♥ 리브에게 맡깁니다')
  expect(await band.find({ type: 'Button', key: 'aim-liv' })).toMatchObject({ props: { variant: 'primary' } })
  await band.unmount()
})

test("on a light theme the members' colors are drawn deeper, and a change of theme is followed from the next prompt", async ($, on) => {
  mock.clock(on, { now: 1000 })
  let theme = 'light'

  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice' as const, value: theme, provider: { plugin: 'core', tier: 'core' as const }, isLocked: false }] }))
  on('config.set', ($, e) => {
    theme = String(e.value)

    return { value: e.value }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })

  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: DOCK })
  const border = async (): Promise<unknown> => (await pane.findAll({ type: 'Box' })).find(box => box.props.key === 'may')?.props.borderColor
  const icon = async (): Promise<unknown> => (await pane.find({ type: 'Raster', key: 'icon-liv' }))?.props.cells

  expect(await border()).toBe('#8a6d00')
  const pale = await icon()

  await $.config.set({ key: 'theme', value: 'dark', previous: 'light', provider: { plugin: 'core', tier: 'core' }, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: '다음 일', wait: false, origin: { kind: 'composer' } })
  expect(await border()).toBe('#ecd25b')
  expect(await icon()).not.toBe(pale)
  await pane.unmount()
})

test('a tool call refused or failed is not shown as done, and one that ends after the mode went off leaves nothing behind', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const gates: (() => void)[] = []

  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', async ($, e) => {
    if (e.tool === 'Edit') return { deny: '막힘' }
    if (e.tool === 'Bash') return { result: { stdout: '', stderr: 'x', interrupted: false }, isError: true as const, text: 'x' }
    await new Promise<void>(open => gates.push(open))

    return { result: { content: '' } }
  })

  await $.turn.start({ text: '고쳐 줘', turnId: 't' })
  await $.tool.call({ tool: 'Edit', file_path: '/w/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'tsc -p .', description: '타입 검사' })

  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: DOCK })

  expect(await pane.find({ type: 'Text', text: '✗ 거절됨: a.ts' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: '✗ 실패: 타입 검사' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /^✓ 고침/ })).toBeUndefined()

  const reading = $.tool.call({ tool: 'Read', file_path: '/w/b.ts' })

  while (gates.length === 0) await Promise.resolve()
  await $.command.run({ command: 'rescene', args: 'off', ...RUN })
  gates[0]?.()
  await reading
  await $.command.run({ command: 'rescene', args: 'on', ...RUN })
  expect(await pane.find({ type: 'Text', text: /읽음: b\.ts/ })).toBeUndefined()
  await pane.unmount()
})

test('a list of agents that could not be read ends nobody, and a guessed ending gives way to the report', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  let listing: 'fails' | 'empty' = 'fails'

  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'agent_1' }))
  on('agent.list', () => {
    if (listing === 'fails') throw new Error('unavailable')

    return { value: [] }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(SPAWN)
  await clock.advance(40_000)
  expect((await $.command.run({ command: 'rescene', args: '', ...RUN })).text).toContain('💙 미나미 (구현) ● 작업 중')

  // Listed by nobody: ended, as a guess.
  listing = 'empty'
  await clock.advance(4000)
  expect((await $.command.run({ command: 'rescene', args: '', ...RUN })).text).toContain('💙 미나미 (구현) ✓ 끝')

  // Then her turn's own ending arrives, and it had failed.
  await $.turn.complete({ turnId: 't1', agentId: 'agent_1', reason: 'error', isAborted: false, answer: '', durationMs: 44_000 })
  const told = (await $.command.run({ command: 'rescene', args: '미나미', ...RUN })).text

  expect(told).toContain('✗ 구현 실패')
  expect(told).toContain('API 오류')
})

test('tasks at work outlast the history kept, and what cleared tasks cost stays counted', async ($, on) => {
  mock.clock(on, { now: 1000 })
  let spawned = 0

  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `agent_${(spawned += 1)}` }))
  on('agent.list', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.agent.spawn({ ...SPAWN, description: '리브: 오래 걸리는 검토' })
  for (let index = 0; index < 44; index += 1) {
    await $.agent.spawn({ ...SPAWN, tool_use_id: `toolu_m${index}`, description: `미나미: 짧은 일 ${index}` })
    await $.turn.complete({
      turnId: `t${index}`,
      agentId: `agent_${index + 2}`,
      reason: 'answer',
      isAborted: false,
      answer: '끝',
      durationMs: 1000,
      usage: { input_tokens: 1000, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' },
    })
  }

  const roster = (await $.command.run({ command: 'rescene', args: '', ...RUN })).text

  expect(roster).toContain('♥ 리브 (검토) ● 작업 중')
  expect((await $.command.run({ command: 'rescene', args: 'usage', ...RUN })).text).toContain('미나미: 입력 4.4만')

  await $.command.run({ command: 'rescene', args: 'clear', ...RUN })
  expect((await $.command.run({ command: 'rescene', args: 'usage', ...RUN })).text).toContain('미나미: 입력 4.4만')
})

test("asked to, a launch that is one plain step keeps the worker's screen for her backstage, and any other is run as written", { options: { keepScreen: true } }, async ($, on) => {
  mock.clock(on, { now: 1000 })
  const ran: string[] = []
  const files: Record<string, string> = { '/w/runs/a/audit.spec.md': '# 코드 점검\n대상: hooks' }

  on('env.get', ($, e) => ({ value: e.name === 'SHELL' ? '/bin/zsh' : '/home/me' }))
  on('fs.read', ($, e) => {
    const text = files[e.path]

    if (text === undefined) throw new Error('ENOENT')

    return { value: text }
  })
  on('fs.stat', ($, e) => {
    const text = files[e.path]

    if (text === undefined) throw new Error('ENOENT')

    return { value: { kind: 'file' as const, size: text.length, mtimeMs: 5000, isLink: false } }
  })
  on('fs.exists', ($, e) => ({ value: files[e.path] !== undefined }))
  on('fs.write', ($, e) => {
    files[e.path] = e.text

    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('tool.call', ($, e) => {
    if (e.tool === 'Bash') ran.push(e.command)

    return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }
  })

  await $.tool.call({ tool: 'Bash', command: 'fleet-run codex-hard --no-browser --cwd /w --spec /w/runs/a/audit.spec.md --out /w/runs/a/audit.out.md', run_in_background: true })

  // A review by its spec's name, so 리브's; her own copy of the spec; the screen kept beside the result.
  expect(ran[0]).toBe("fleet-run codex-hard --no-browser --cwd /w --spec /w/runs/a/audit.spec.rescene-liv.md --out /w/runs/a/audit.out.md 2>&1 | { tee '/w/runs/a/audit.out.md.live.log' 2>/dev/null || cat; }; (exit \"${PIPESTATUS[0]:-${pipestatus[1]}}\")")

  files['/w/runs/a/audit.out.md.live.log'] = '▶ codex-hard  codex gpt-6-astra · high\n  ▸ 실행: rg -n register hooks\n  … 1분 경과\n'
  const told = (await $.command.run({ command: 'rescene', args: '리브', ...RUN })).text

  expect(told).toContain('맡은 일: audit')
  expect(told).toContain('지시: 코드 점검')
  expect(told).toContain('작업자 화면 (지금)')
  expect(told).toContain('\n▸ 실행: rg -n register hooks')

  await $.tool.call({ tool: 'Bash', command: 'cd /w && fleet-run codex-build --spec /w/runs/a/audit.spec.md --out /w/runs/a/b.out.md', run_in_background: true })
  expect(ran[1]).not.toContain('tee')
})

test('the roles are the person\'s to set: a press or a command gives a member a kind of work, kept between sessions, and 자동 gives each her own back', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const kept: Record<string, unknown> = {}
  const sent: { text: string; context?: readonly string[] }[] = []
  const spawned: { description: string; prompt: string }[] = []

  on('store.get', ($, e) => ({ value: kept[e.key] }))
  on('store.set', ($, e) => {
    kept[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    delete kept[e.key]

    return { value: undefined }
  })
  on('prompt.submit', ($, e) => {
    sent.push(e)

    return { text: e.text }
  })
  on('agent.spawn', ($, e) => {
    spawned.push(e)

    return { model: 'claude-sonnet-5-5', agentId: `agent_${spawned.length}` }
  })
  on('agent.list', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.blit', () => ({ value: {} }))
  on('tool.call', () => ({ result: { content: '' } }))

  // The first prompt carries the roster as it stands: each member's own position.
  await $.prompt.submit({ text: '안녕', wait: false, origin: { kind: 'composer' } })
  expect((sent[0]?.context ?? []).join('\n')).toContain('- 💙 미나미 (올라운더): 구현, 수정')

  // The command opens the pane on the screen the roles are set on.
  const shown = (await $.command.run({ command: 'rescene', args: 'role', ...RUN })).text

  expect(shown).toContain('지금: 자동 (기본, 멤버 본래 포지션)')
  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await pane.find({ type: 'Text', text: ' 역할 설정' })).toBeDefined()
  expect(await pane.find({ type: 'Button', key: 'cast-auto' })).toMatchObject({ props: { variant: 'primary', hotkey: 'a' } })
  expect(await pane.find({ type: 'Button', key: 'cast-liv-검토' })).toMatchObject({ props: { variant: 'primary' } })

  // 리브 takes 구현: 미나미, who had it, takes 검토 in exchange.
  await pane.press({ key: 'cast-liv-구현' })
  expect(await pane.find({ type: 'Button', key: 'cast-liv-구현' })).toMatchObject({ props: { variant: 'primary' } })
  expect(await pane.find({ type: 'Button', key: 'cast-minami-검토' })).toMatchObject({ props: { variant: 'primary' } })
  expect(await pane.find({ type: 'Button', key: 'cast-auto' })).toMatchObject({ props: { plain: true } })
  expect(await pane.find({ type: 'Text', text: '지금: 직접 설정' })).toBeDefined()
  expect(kept.cast).toEqual({ 구현: 'liv', 검토: 'minami', 조사: 'may', 탐색: 'zena' })

  // The main loop is told once, with the next prompt.
  await $.prompt.submit({ text: '버튼 색 바꿔 줘', wait: false, origin: { kind: 'composer' } })
  expect((sent[1]?.context ?? []).join('\n')).toContain('[리센느 역할 변경]')
  expect((sent[1]?.context ?? []).join('\n')).toContain('- ♥ 리브 (최종병기): 구현, 수정')
  await $.prompt.submit({ text: '하나 더', wait: false, origin: { kind: 'composer' } })
  expect((sent[2]?.context ?? []).join('\n')).not.toContain('[리센느 역할 변경]')

  // Work goes by the new cast: a build to 리브, the main session's own edit to her card.
  const base = { tool_use_id: 'u1', prompt: '고쳐 줘', subagentType: 'general-purpose', provider: { plugin: 'core', tier: 'core' }, parentModel: 'm', background: false, fork: false } as const

  await $.agent.spawn({ ...base, description: '로그인 폼 구현' })
  expect(spawned[0]?.description).toBe('♥ 리브 · 로그인 폼 구현')
  expect(spawned[0]?.prompt).toContain('구현 담당')

  // Back to the cards, where her card says her new kind of work.
  await pane.press({ key: 'setup-close' })
  expect(await pane.find({ type: 'Text', text: ' 역할 설정' })).toBeUndefined()
  expect(await pane.find({ type: 'Text', text: ' 리뿌 · 최종병기 · 구현' })).toBeDefined()
  expect(await pane.find({ type: 'Button', key: 'setup' })).toMatchObject({ props: { hotkey: 'r', label: '역할 설정' } })

  // By command, and 원이 stays the leader.
  expect((await $.command.run({ command: 'rescene', args: 'role 제나 조사', ...RUN })).text).toContain('💜 제나가 이제 조사 담당이에요.')
  expect(kept.cast).toEqual({ 구현: 'liv', 검토: 'minami', 조사: 'zena', 탐색: 'may' })
  expect((await $.command.run({ command: 'rescene', args: 'role 원이 구현', ...RUN })).text).toContain('원이는 리더라 지휘를 그대로 맡습니다.')

  // 자동: every member her own again, and nothing kept.
  await pane.press({ key: 'setup' })
  await pane.press({ key: 'cast-auto' })
  expect(await pane.find({ type: 'Button', key: 'cast-liv-검토' })).toMatchObject({ props: { variant: 'primary' } })
  expect(kept.cast).toBeUndefined()
  await pane.unmount()
})

test('a cast kept from a session before is the one this session starts with', async ($, on) => {
  mock.clock(on, { now: 1000 })
  on('store.get', () => ({ value: { 구현: 'zena', 검토: 'liv', 조사: 'may', 탐색: 'minami' } }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.blit', () => ({ value: {} }))

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const shown = (await $.command.run({ command: 'rescene', args: 'role', ...RUN })).text

  expect(shown).toContain('지금: 직접 설정')
  expect(shown).toContain('구현 💜 제나')
})

test("a worker launched in an Orca terminal of its own has its screen read: what it is on shows on her card and in her backstage", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const files: Record<string, string> = { '/w/runs/a/audit.spec.md': '# 코드 점검' }
  const asked: string[][] = []
  let screen = '▶ codex-hard  codex gpt-6-astra · high\n  ▸ 실행: /bin/zsh -lc \'rg -n register hooks\'\n'

  on('env.get', () => ({ value: '/home/me' }))
  on('fs.read', ($, e) => {
    const text = files[e.path]

    if (text === undefined) throw new Error('ENOENT')

    return { value: text }
  })
  on('fs.stat', ($, e) => {
    const text = files[e.path]

    if (text === undefined) throw new Error('ENOENT')

    return { value: { kind: 'file' as const, size: text.length, mtimeMs: 5000, isLink: false } }
  })
  on('fs.exists', ($, e) => ({ value: files[e.path] !== undefined }))
  on('fs.write', ($, e) => {
    files[e.path] = e.text

    return { value: undefined }
  })
  on('process.run', ($, e) => {
    asked.push([...e.argv])

    return { value: { exitCode: 0, stdout: screen, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('agent.list', () => ({ value: [] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.blit', () => ({ value: {} }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: { stdout: '{ "ok": true, "result": { "terminal": { "handle": "term_ab12-cd", "title": "x" } } }', stderr: '', interrupted: false } }))

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'orca terminal create --title a --command "fleet-run codex-hard --spec /w/runs/a/audit.spec.md --out /w/runs/a/audit.out.md; echo done" --json' })
  await clock.advance(8000)

  expect(asked.at(-1)).toEqual(['orca', 'terminal', 'read', '--terminal', 'term_ab12-cd', '--screen'])
  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  // Her card says what the worker is on, without the shell it ran in.
  expect(await pane.find({ type: 'Text', text: /실행: rg -n register hooks/ })).toBeDefined()

  screen += '  ▸ 실행: /bin/zsh -lc \'claude plugin test .\'\n  … 1분 경과\n'
  await clock.advance(8000)
  expect(await pane.find({ type: 'Text', text: /실행: claude plugin test \./ })).toBeDefined()

  const told = (await $.command.run({ command: 'rescene', args: '리브', ...RUN })).text

  expect(told).toContain('작업자 화면 (지금)')
  expect(told).toContain('… 1분 경과')
  await pane.unmount()
})
