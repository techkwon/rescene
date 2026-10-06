import type { AgentSpawnInput, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { actionOf } from '../hooks/action'
import { isKorean, langOf, pinned, setLang } from '../hooks/lang'
import { CAST } from '../hooks/members'
import { ago, amount, castLines, spent, spoken, until } from '../hooks/view'
import { aimBlock, castBlock, firstLine, memberBlock, orcaBlock, soloBlock } from '../hooks/voice'

const EN = { options: { language: 'en' } }
const KO = { options: { language: 'ko' } }

const SPAWN: AgentSpawnInput = {
  tool_use_id: 'toolu_1',
  prompt: 'Fix the login form.',
  description: 'build the login form',
  subagentType: 'general-purpose',
  provider: { plugin: 'core', tier: 'core' },
  parentModel: 'claude-opus-5-5',
  background: false,
  fork: false,
}

const BAND = { hasSurvey: false, isWorking: true, maxRows: 3, bodyColumns: 100, scroll: { offset: 0, bodyRows: 3 }, view: {} }
const PANE = { title: 'RESCENE', isFocused: false, bodyColumns: 72, placement: 'dock', scroll: { offset: 0, bodyRows: 52 }, view: {} } as const
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
const START = { cwd: '/w', surface: 'terminal', isInteractive: true } as const
const FACTS = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: ['Agent'], outputStyle: null, traits: [] } as const
const HANGUL = /[가-힣]/

/** A session's surroundings: what its settings and its store hold, and what is written to the store. */
const around = (on: On, has: { language?: string; isReadOnly?: boolean; registered?: string[]; gate?: () => Promise<void> } = {}) => {
  const kept: Record<string, unknown> = {}

  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', ($, e) => {
    has.registered?.push(e.description)

    return { value: { command: e.name } }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  // Read as of the asking, and answered once the gate (where there is one) opens.
  on('store.get', async ($, e) => {
    const value = kept[e.key]

    await has.gate?.()

    return { value }
  })
  on('store.set', ($, e) => {
    if (has.isReadOnly === true) throw new Error('read-only')
    kept[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    delete kept[e.key]

    return { value: undefined }
  })
  on('config.list', () => ({
    value: has.language === undefined ? [] : [{ key: 'language', label: 'Language', kind: 'text' as const, value: has.language, provider: { plugin: 'core', tier: 'core' as const }, isLocked: false }],
  }))

  return kept
}

test('the signs of a Korean reader are read strongest first, and a terminal left in English settles nothing', () => {
  expect(langOf({})).toBe('en')
  expect(langOf({ env: [undefined, undefined, 'ko_KR.UTF-8'] })).toBe('ko')
  expect(langOf({ env: ['en_US.UTF-8', undefined, 'ko_KR.UTF-8'] })).toBe('ko')
  expect(langOf({ env: [undefined, undefined, 'en_US.UTF-8'], locale: 'ko-KR' })).toBe('ko')
  expect(langOf({ env: [undefined, undefined, 'en_US.UTF-8'], locale: 'en-US', timeZone: 'Asia/Seoul' })).toBe('ko')
  expect(langOf({ env: [undefined, undefined, 'en_US.UTF-8'], locale: 'en-US', timeZone: 'America/New_York' })).toBe('en')
  expect(langOf({ env: [undefined, undefined, 'ja_JP.UTF-8'], locale: 'ja-JP', timeZone: 'Asia/Tokyo' })).toBe('en')
  // A word that only begins like Korean's code is another language's.
  expect(langOf({ env: [undefined, undefined, 'kok_IN.UTF-8'], locale: 'kok-IN' })).toBe('en')
  // The language Claude Code is set to answer in says more than where the machine is.
  expect(langOf({ setting: 'English', env: [undefined, undefined, 'ko_KR.UTF-8'], timeZone: 'Asia/Seoul' })).toBe('en')
  expect(langOf({ setting: '한국어', locale: 'en-US', timeZone: 'Europe/Paris' })).toBe('ko')
  expect(langOf({ setting: 'korean' })).toBe('ko')
  for (const setting of ['ko', 'kr', 'ko_KR', 'ko-KR', '한국말', 'Answer in Korean', 'KOR']) expect({ setting, lang: langOf({ setting }) }).toEqual({ setting, lang: 'ko' })
  for (const setting of ['English', 'Japanese', 'Kokborok', 'kok', 'Polski']) expect({ setting, lang: langOf({ setting, timeZone: 'Asia/Seoul' }) }).toEqual({ setting, lang: 'en' })
  expect(langOf({ setting: '  ', timeZone: 'Asia/Seoul' })).toBe('ko')
  // Left at its default, the setting shows as `Default (English)`: nobody chose that, and the other signs decide.
  expect(langOf({ setting: 'Default (English)', env: [undefined, undefined, 'en_US.UTF-8'], locale: 'en-US', timeZone: 'Asia/Seoul' })).toBe('ko')
  expect(langOf({ setting: 'Default (English)', env: [undefined, undefined, 'ko_KR.UTF-8'] })).toBe('ko')
  expect(langOf({ setting: 'Default (English)', locale: 'en-GB', timeZone: 'Europe/London' })).toBe('en')
})

test('a language is named by its code or its name, and auto names none', () => {
  expect(pinned('ko')).toBe('ko')
  expect(pinned(' Korean ')).toBe('ko')
  expect(pinned('한국어')).toBe('ko')
  expect(pinned('EN')).toBe('en')
  expect(pinned('english')).toBe('en')
  expect(pinned('auto')).toBeUndefined()
  expect(pinned('')).toBeUndefined()
  expect(pinned(undefined)).toBeUndefined()
  expect(pinned({ 구현: 'liv' })).toBeUndefined()
})

test("a text is Korean by what it says beyond the members' names", () => {
  expect(isKorean('로그인 폼 고쳐 줘')).toBe(true)
  expect(isKorean('register.tsx 의 leaderSection 함수 확인')).toBe(true)
  expect(isKorean('/goal 버튼 고쳐 줘')).toBe(true)
  // A Korean word asked about in English, or a command naming a member and a role, is not Korean written.
  expect(isKorean('what does 감사합니다 mean in this log line?')).toBe(false)
  expect(isKorean('/rescene role 리브 구현')).toBe(false)
  expect(isKorean('/rescene to 자동')).toBe(false)
  expect(isKorean('ask 리브 to review this, then 미나미')).toBe(false)
  expect(isKorean('리센느 리마인 원이 메이 제나')).toBe(false)
  expect(isKorean('fix the login form')).toBe(false)
})

test('figures, times and what a tool call is doing read the English way in English', () => {
  setLang('en')
  try {
    expect([amount(999), amount(4600), amount(171_000), amount(999_600), amount(1_250_000), amount(2_300_000_000)]).toEqual(['999', '4.6k', '171k', '1M', '1.3M', '2.3B'])
    expect(spent({ fresh: 4600, cached: 171_000, out: 800, usd: 0.5 })).toBe('in 4.6k · cache 171k · out 800 · $0.50')
    expect([spoken(9000), spoken(65_000)]).toEqual(['9s', '1m 5s'])
    expect([ago(1000, 3000), ago(1000, 15_000), ago(0, 600_000), ago(0, 7_200_000)]).toEqual(['now', '14s ago', '10m ago', '2h ago'])
    expect([until(600_000, 0), until(9_000_000, 0), until(260_000_000, 0)]).toEqual(['resets in 10m', 'resets in 2h 30m', 'resets in 3d'])
    expect(actionOf('Read', { file_path: '/w/hooks/view.tsx' }, CAST)).toMatchObject({ phrase: 'Reading: view.tsx', past: 'Read: view.tsx' })
    expect(actionOf('Edit', { file_path: '/w/hooks/view.tsx' }, CAST)).toMatchObject({ member: 'minami', phrase: 'Editing: view.tsx' })
    expect(actionOf('Bash', { command: 'tsc -p .', description: 'type check' }, CAST)).toMatchObject({ phrase: 'Running: type check', past: 'Ran: type check' })
    expect(castLines(CAST)).toEqual([
      'Now: auto (default, each member in her own position)',
      'build    💙 MINAMI building, fixing',
      'review   ♥ LIV    review, verification, tests',
      'research 💛 MAY    research, documents, write-ups',
      'scout    💜 ZENA   exploring code, locating things, errands',
    ])
  } finally {
    setLang('ko')
  }
})

test('the blocks the model reads are whole in either language, and a report opens under either name', () => {
  setLang('en')
  try {
    expect(memberBlock('zena', '탐색')).toContain("[RESCENE member]\nThis task is taken by RESCENE's ZENA (제나), who has the scout work.")
    expect(memberBlock('zena', '탐색')).toContain('"아뉘이이이!"')
    expect(orcaBlock('may', '조사')).toContain('Begin only its first line with "💛 MAY:"')
    expect(aimBlock('liv', CAST)).toContain('The description must start with "LIV: " for LIV to take it.')
    expect(soloBlock()).toContain('The person picked WONI to handle this request herself.')
    expect(castBlock(CAST).split('\n')[0]).toBe('[RESCENE roles changed]')
  } finally {
    setLang('ko')
  }
  expect(memberBlock('zena', '탐색')).toContain('[리센느 멤버 배정]\n이 작업은 리센느 제나(')
  expect(firstLine('💙 MINAMI: the login form is fixed.')).toBe('the login form is fixed.')
  expect(firstLine('♥ Liv: found it')).toBe('found it')
  expect(firstLine('💙 미나미: 로그인 폼을 고쳤어요.')).toBe('로그인 폼을 고쳤어요.')
})

test('in English a member is cast under her Latin name and told in English how to report, her lines still her own Korean ones', EN, async ($, on) => {
  mock.clock(on, { now: 1000 })
  const seen: AgentSpawnInput[] = []

  on('agent.spawn', ($, e) => {
    seen.push(e)

    return { model: 'claude-sonnet-5-5', agentId: `agent_${seen.length}` }
  })

  await $.agent.spawn(SPAWN)
  await $.agent.spawn({ ...SPAWN, tool_use_id: 'toolu_2', description: 'LIV: look over the changed code' })
  const duo = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: BAND })

  // A unit's name is its own, in any language.
  expect(await duo.find({ type: 'Text', text: /^(?:06즈|밍뿌즈) on stage$/ })).toBeDefined()
  await duo.unmount()
  // A task that already ends with a member's block, in either language, is not given another.
  await $.agent.spawn({ ...SPAWN, tool_use_id: 'toolu_3', description: 'find the config', prompt: 'Find it.\n\n---\n[리센느 멤버 배정]\n이 작업은 리센느 제나가 맡는다.' })

  expect(seen[0]?.description).toBe('💙 MINAMI · build the login form')
  expect(seen[0]?.prompt).toContain('Fix the login form.')
  expect(seen[0]?.prompt).toContain('[RESCENE member]')
  expect(seen[0]?.prompt).toContain('You are MINAMI, not WONI the conductor')
  expect(seen[0]?.prompt).toContain('Begin the first line of the report with "💙 MINAMI:"')
  expect(seen[0]?.prompt).toContain('"쿄 아손데콩!"')
  expect(seen[0]?.prompt).not.toContain('너는 지휘자')
  expect(seen[1]?.description).toBe('♥ LIV · look over the changed code')
  expect(seen[1]?.prompt).toContain('who has the review work')
  expect(seen[2]?.prompt).not.toContain('[RESCENE member]')

  const band = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: BAND })

  expect(await band.find({ type: 'Text', text: /^ MINAMI $/ })).toMatchObject({ props: { backgroundColor: '#2b99c4' } })
  expect(await band.find({ type: 'Text', text: /^ ZENA $/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /scout started · find the config/ })).toBeDefined()
  await band.unmount()
})

test('in English every word the panel, the band and the commands write is English, but for names and lines the members really said', EN, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })

  around(on)
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.start(START)
  await $.session.measure({ changed: ['rateLimits'], context: { window: 200_000, percent: 30, tokens: 60_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 41, resetsAt: new Date(1000 + 7_500_000).toISOString() }, { kind: 'seven_day', percentUsed: 12 }] })
  await $.agent.spawn(SPAWN)
  await $.agent.spawn({ ...SPAWN, tool_use_id: 'toolu_2', description: 'LIV: look over the changed code' })
  await clock.advance(4000)

  // What a member said is hers and Korean, drawn between “ ”; so are her name under her Latin one, and a unit's name.
  const bare = (text: string): string =>
    text
      .replace(/“[^”]*”/g, '')
      .replace(/(?:원이|리브|미나미|메이|제나) · /g, '')
      .replace(/\S+ on stage|On stage now: \S+/g, '')
  const strays = async (view: { findAll: (query: { type: string }) => Promise<{ text: string }[]> }): Promise<string[]> =>
    [...(await view.findAll({ type: 'Text' })), ...(await view.findAll({ type: 'Button' }))].map(node => node.text).filter(text => HANGUL.test(bare(text)))

  const pane = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await strays(pane)).toEqual([])
  expect(await pane.find({ type: 'Text', text: /On stage now/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Usage' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /41% used · resets in 2h \dm/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /70% left · context 60k \/ 200k/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: 'Stage log' })).toBeDefined()
  await pane.unmount()

  const band = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, maxRows: 6, bodyColumns: 140 } })

  expect(await strays(band)).toEqual([])
  expect(await band.find({ type: 'Text', text: 'Send to' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: '→ WONI hands it out' })).toBeDefined()
  expect(await band.find({ type: 'Button', text: 'Roles' })).toBeDefined()
  await band.unmount()

  // Her backstage, then the screen the roles are set on.
  await $.command.run({ command: 'rescene', args: 'liv', ...RUN })
  const backstage = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await strays(backstage)).toEqual([])
  expect(await backstage.find({ type: 'Text', text: ' Backstage: LIV' })).toBeDefined()
  expect(await backstage.find({ type: 'Text', text: /^Task: look over the changed code/ })).toBeDefined()
  await backstage.unmount()
  await $.command.run({ command: 'rescene', args: 'role', ...RUN })
  const casting = await $.ui.mount({ plugin: 'rescene', surface: 'terminal', component: 'Pane', requestId: 'rescene', props: PANE })

  expect(await strays(casting)).toEqual([])
  expect(await casting.find({ type: 'Text', text: 'What each role does' })).toBeDefined()
  expect(await casting.find({ type: 'Button', text: 'research' })).toBeDefined()
  await casting.unmount()

  for (const args of ['', 'usage', 'cup', 'role', 'liv', 'to minami', 'to auto', 'role liv build', 'role auto', 'nonsense', 'lang', 'demo', 'clear', 'off', 'on']) {
    const { text = '' } = await $.command.run({ command: 'rescene', args, ...RUN })
    const lines = text.split('\n').filter(line => HANGUL.test(bare(line)))

    expect({ args, lines }).toEqual({ args, lines: [] })
  }
  expect((await $.command.run({ command: 'rescene', args: 'role zena review', ...RUN })).text).toContain('💜 ZENA now has the review work.')
  expect((await $.command.run({ command: 'rescene', args: 'role', ...RUN })).text).toContain('review   💜 ZENA')
  expect((await $.command.run({ command: 'rescene', args: 'usage', ...RUN })).text).toContain('battery ▰▰▰▰▰▰▰▱▱▱ 70% left')
  expect((await $.command.run({ command: 'rescene', args: 'to liv', ...RUN })).text).toBe('From the next prompt the work goes to ♥ LIV. To undo: /rescene to auto')
})

test('in English the main loop is told in English that it conducts as WONI, and told who took a task', EN, async ($, on) => {
  mock.clock(on, { now: 1000 })
  const told: (readonly string[] | undefined)[] = []

  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] }))
  on('prompt.submit', ($, e) => {
    told.push(e.context)

    return { text: e.text }
  })
  on('tool.call', () => ({ result: '💙 MINAMI: done.' as never }))
  on('ui.toast', () => ({ value: undefined }))
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))

  const section = (await $.prompt.compose(FACTS)).sections[1]?.text ?? ''

  expect(section).toContain('You conduct as WONI (원이)')
  expect(section).toContain('"우이!"')
  expect(section).toContain('- 💙 MINAMI (the all-rounder): building, fixing')
  expect(section).not.toContain('너는 원이')

  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect(told[0]?.[0]).toContain('# RESCENE mode')

  await $.agent.spawn({ ...SPAWN, tool_use_id: 'toolu_9' })
  const ran = await $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_9', description: 'build the login form', prompt: 'Fix the login form.', subagent_type: 'general-purpose' })

  expect(ran.context?.at(-1)).toBe("[RESCENE cast] This task was taken by MINAMI (build). When you tell the person, speak of it as MINAMI's work.")

  await $.command.run({ command: 'rescene', args: 'off', ...RUN })
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect(told[1]?.[0]).toContain('RESCENE mode is off.')
  await $.command.run({ command: 'rescene', args: 'on', ...RUN })
})

test('nothing set, the session is Korean where its terminal is, whatever else the machine says', async ($, on) => {
  mock.clock(on, { now: 1000 })
  around(on, { language: 'Default (English)' })
  mock.env(on, { LANG: 'ko_KR.UTF-8' })
  await $.session.start(START)

  expect((await $.command.run({ command: 'rescene', args: 'lang', ...RUN })).text).toContain('지금 언어: 한국어 (자동)')
})

test("nothing set, the session is English where Claude Code is set to answer in English, and Korean from the first prompt written in Korean", async ($, on) => {
  const told: (readonly string[] | undefined)[] = []
  const registered: string[] = []

  mock.clock(on, { now: 1000 })
  around(on, { language: 'English', registered })
  mock.env(on, { LANG: 'en_US.UTF-8' })
  on('prompt.submit', ($, e) => {
    told.push(e.context)

    return { text: e.text }
  })
  await $.session.start(START)

  expect((await $.command.run({ command: 'rescene', args: 'lang', ...RUN })).text).toContain('Language now: English (auto)')
  expect(registered.at(-1)).toContain('RESCENE mode')

  // A member's name in Hangul is what any fan writes: it says nothing of the reader.
  await $.prompt.submit({ text: 'ask 리브 to review this', wait: false, origin: { kind: 'composer' } })
  expect(told[0]?.[0]).toContain('# RESCENE mode')
  expect((await $.command.run({ command: 'rescene', args: 'lang', ...RUN })).text).toContain('Language now: English (auto)')

  // Written in Korean, the session is Korean from here on, and the main loop is briefed anew in it.
  await $.prompt.submit({ text: '로그인 폼 고쳐 줘', wait: false, origin: { kind: 'composer' } })
  expect(told[1]?.[0]).toContain('리센느 리더 원이(WONI)')
  expect((await $.command.run({ command: 'rescene', args: 'lang', ...RUN })).text).toContain('지금 언어: 한국어 (자동)')
  expect(registered.at(-1)).toContain('리센느 모드')

  // And it does not go back for a prompt in English.
  await $.prompt.submit({ text: 'thanks', wait: false, origin: { kind: 'composer' } })
  expect(told[2]).toBeUndefined()
  expect((await $.command.run({ command: 'rescene', args: 'usage', ...RUN })).text).toContain('RESCENE 사용량')
})

test('a language picked by command is used at once, kept for later sessions, and has the last word over the setting until it is given back', KO, async ($, on) => {
  mock.clock(on, { now: 1000 })
  const kept = around(on)
  const told: (readonly string[] | undefined)[] = []

  on('prompt.submit', ($, e) => {
    told.push(e.context)

    return { text: e.text }
  })
  await $.session.start(START)
  await $.prompt.submit({ text: '안녕', wait: false, origin: { kind: 'composer' } })
  expect(told[0]?.[0]).toContain('리센느 리더 원이(WONI)')
  expect((await $.command.run({ command: 'rescene', args: 'lang', ...RUN })).text).toContain('지금 언어: 한국어 (모드 설정 language)')

  expect((await $.command.run({ command: 'rescene', args: 'lang en', ...RUN })).text).toBe('English from now on, in later sessions too.')
  expect(kept.lang).toBe('en')
  expect((await $.command.run({ command: 'rescene', args: 'lang', ...RUN })).text).toContain('Language now: English (picked by you)')
  expect((await $.command.run({ command: 'rescene', args: 'usage', ...RUN })).text).toContain('RESCENE usage')

  // Briefed in Korean before: briefed once more, in English. Writing Korean does not undo a pick.
  await $.prompt.submit({ text: '안녕하세요, 다음 일 부탁해요', wait: false, origin: { kind: 'composer' } })
  expect(told[1]?.[0]).toContain('# RESCENE mode')
  expect((await $.command.run({ command: 'rescene', args: 'lang', ...RUN })).text).toContain('Language now: English (picked by you)')

  // A session started anew finds the pick in the store.
  await $.session.start(START)
  expect((await $.command.run({ command: 'rescene', args: 'usage', ...RUN })).text).toContain('RESCENE usage')

  expect((await $.command.run({ command: 'rescene', args: 'lang 중국어', ...RUN })).text).toContain('To change: /rescene lang ko · en · auto')
  expect((await $.command.run({ command: 'rescene', args: 'lang auto', ...RUN })).text).toContain('언어를 자동으로 돌렸어요. 지금은 한국어입니다 (모드 설정 language).')
  expect('lang' in kept).toBe(false)
  expect((await $.command.run({ command: 'rescene', args: 'usage', ...RUN })).text).toContain('RESCENE 사용량')
})

test('a pick that could not be kept is said to hold for this session only', EN, async ($, on) => {
  mock.clock(on, { now: 1000 })
  around(on, { isReadOnly: true })
  await $.session.start(START)

  expect((await $.command.run({ command: 'rescene', args: 'lang ko', ...RUN })).text).toBe('이제 한국어로 보여 드려요.\n저장하지 못해서 이 세션에만 적용됩니다.')
})

test('a session that starts again in another language than it was briefed in briefs the main loop anew', async ($, on) => {
  mock.clock(on, { now: 1000 })
  const kept = around(on, { language: '한국어' })
  const told: (readonly string[] | undefined)[] = []

  on('prompt.submit', ($, e) => {
    told.push(e.context)

    return { text: e.text }
  })
  await $.session.start(START)
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect(told[0]?.[0]).toContain('리센느 리더 원이(WONI)')

  // Picked in another session since: this one finds it as it starts again.
  kept.lang = 'en'
  await $.session.start(START)
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect(told[1]?.[0]).toContain('# RESCENE mode')
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect(told[2]).toBeUndefined()
})

test('a language picked while the session is still starting is not undone by what the start had read', EN, async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  let open = (): void => {}
  const gate = new Promise<void>(resolve => {
    open = resolve
  })

  around(on, { gate: () => gate })
  const start = $.session.start(START)

  await clock.settle()
  const picking = $.command.run({ command: 'rescene', args: 'lang ko', ...RUN })

  await clock.settle()
  open()
  await start
  expect((await picking).text).toBe('이제 한국어로 보여 드려요. 다음 세션에도 그대로입니다.')
  expect((await $.command.run({ command: 'rescene', args: 'lang', ...RUN })).text).toContain('지금 언어: 한국어 (직접 고름)')
})
