import { expect, test } from 'claude-code/testing'

import { actionOf } from '../hooks/action'
import { cheerOf, frameOf, iconOf } from '../hooks/sprites'

import { CAST, castOf, LINES, pickMember, recast, roleIn, roleOfAgent, roleOfRun, say, SPOKEN, unitOf } from '../hooks/members'
import { findFleetRuns, isDetached, isPlainLaunch, readMeta, readTokens, voicedSpecPath } from '../hooks/orca'
import { amount, cells, fit, spoken, until } from '../hooks/view'
import { aimBlock, askOf, castBlock, firstLine, leaderSection, memberBlock, namedMember } from '../hooks/voice'
import type { Task } from '../types'

const task = (member: Task['member'], status: Task['status']): Task => ({
  id: member,
  kind: 'agent',
  member,
  role: roleIn(CAST, member),
  engine: 'general-purpose',
  title: '일',
  status,
  startedAt: 0,
  toolCount: 0,
  quote: '',
  note: '',
})

test('the role picks its own member, and the next free one while she is busy', () => {
  expect(pickMember('구현', [])).toBe('minami')
  expect(pickMember('검토', [])).toBe('liv')
  expect(pickMember('조사', [])).toBe('may')
  expect(pickMember('탐색', [])).toBe('zena')
  expect(pickMember('구현', [task('minami', 'running')])).toBe('liv')
  expect(pickMember('구현', [task('minami', 'done')])).toBe('minami')
})

test('an agent type or a description tells the role', () => {
  expect(roleOfAgent('Explore', '로그인 코드 위치')).toBe('탐색')
  expect(roleOfAgent('quality-engineer', '테스트')).toBe('검토')
  expect(roleOfAgent('technical-writer', '문서')).toBe('조사')
  expect(roleOfAgent('general-purpose', '바뀐 코드 검토')).toBe('검토')
  expect(roleOfAgent('general-purpose', '로그인 폼 구현')).toBe('구현')
  expect(roleOfAgent('general-purpose', '바뀐 코드 다시 보기')).toBe('검토')
  expect(roleOfAgent('general-purpose', '이것저것')).toBeUndefined()
})

test('members at work together go by their unit name', () => {
  expect(unitOf([task('liv', 'running'), task('minami', 'running')])).toBe('06즈')
  expect(unitOf([task('may', 'running'), task('zena', 'waiting')])).toBe('막내즈')
  expect(unitOf([task('liv', 'done'), task('minami', 'running')])).toBe('원나미')
  expect(unitOf([task('may', 'running'), task('zena', 'waiting')], 2)).toBe('제첩과 메스타드')
  expect(unitOf([task('may', 'running'), task('zena', 'waiting')], 3)).toBe('막내즈')
  expect(unitOf([task('liv', 'done')])).toBeUndefined()
})

test("a line is one of the member's own, and 제나 fills hers in", () => {
  expect(say('zena', 'fail', 0, '탐색')).toBe('아뉘이이이!')
  expect(say('zena', 'done', 2, '탐색')).toBe('내는 원래 탐색을 싸랑해.')
  expect(say('zena', 'done', 2, '조사')).toBe('내는 원래 조사를 싸랑해.')
  expect(say('liv', 'slow', 0, '검토')).toBe('야 곧 기다려. 나 후반부야.')
  expect(say('minami', 'done', 0, '구현')).toBe('거제 야호-!')
})

test('a description that names a member hands her the task', () => {
  expect(namedMember('리브: 바뀐 코드 검토')).toEqual({ member: 'liv', rest: '바뀐 코드 검토' })
  expect(namedMember('MINAMI - 폼 구현')).toEqual({ member: 'minami', rest: '폼 구현' })
  expect(namedMember('메이저 버전 올리기')).toEqual({ rest: '메이저 버전 올리기' })
})

test('the voice blocks name the member and carry only her own lines', () => {
  const block = memberBlock('may', '조사')

  expect(block).toContain('[리센느 멤버 배정]')
  expect(block).toContain('너는 지휘자 원이가 아니라 메이다')
  for (const line of LINES.may) expect(block).toContain(line)
  expect(block).not.toContain('아뉘이이이')
  expect(leaderSection()).toContain('인사드리겠습니다. 둘, 셋!')
})

test('fleet-run launches are read out of a command, variables and all', () => {
  const direct = findFleetRuns('fleet-run codex-build --cwd /w --spec /w/runs/a/login.spec.md --out /w/runs/a/login.out.md')

  expect(direct).toEqual([
    { profile: 'codex-build', rawSpec: '/w/runs/a/login.spec.md', spec: '/w/runs/a/login.spec.md', out: '/w/runs/a/login.out.md', title: 'login' },
  ])

  const wrapped = findFleetRuns(
    `RUN=/w/runs/b; orca terminal create --worktree "id:$ORCA_WORKTREE_ID" --title "grok" --command "fleet-run grok-research --cwd $RUN --spec $RUN/x.spec.md --out $RUN/x.out.md; echo '[fleet-run 끝]'" --json`,
  )

  expect(wrapped).toHaveLength(1)
  expect(wrapped[0]).toMatchObject({ profile: 'grok-research', rawSpec: '$RUN/x.spec.md', spec: '/w/runs/b/x.spec.md', out: '/w/runs/b/x.out.md', title: 'x' })
  expect(findFleetRuns('fleet-run agy-pro --spec ~/s.spec.md --out "$UNKNOWN/o.out.md"', '/home/me')[0]).toMatchObject({ spec: '/home/me/s.spec.md', out: undefined })
  expect(findFleetRuns('fleet-run list')).toEqual([])
  expect(isDetached('orca terminal create --command "fleet-run codex-build"')).toBe(true)
  expect(isDetached('fleet-run codex-scout --spec a --out b')).toBe(false)
  expect(voicedSpecPath('/w/login.spec.md', 'liv')).toBe('/w/login.spec.rescene-liv.md')
})

test("each engine's usage comes out as one shape", () => {
  expect(readTokens({ input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50 })).toEqual({ fresh: 200, cached: 800, out: 50, usd: undefined })
  expect(readTokens({ input_tokens: 10, cache_creation_input_tokens: 90, cache_read_input_tokens: 400, output_tokens: 5 })).toEqual({ fresh: 100, cached: 400, out: 5, usd: undefined })
  expect(readTokens({ input_tokens: 100, cache_read_input_tokens: 300, output_tokens: 7, cost_usd: 0.45 })).toEqual({ fresh: 100, cached: 300, out: 7, usd: 0.45 })
  expect(readTokens({ input_tokens: 70, cache_read_tokens: 30, output_tokens: 6 })).toEqual({ fresh: 70, cached: 30, out: 6, usd: undefined })
  expect(readTokens({ cost_usd: null })).toBeUndefined()
  expect(readMeta('{"exit_code":3,"model":"grok-4.7","seconds":404,"status":"exit 1, 결과 없음","usage":{"cost_usd":null}}')).toEqual({
    isOk: false,
    note: 'grok-4.7 · 404초 · exit 1, 결과 없음',
    tokens: undefined,
  })
  expect(readMeta('not json')).toBeUndefined()
})

test('figures read the way they are said', () => {
  expect(amount(999)).toBe('999')
  expect(amount(4554)).toBe('4.6천')
  expect(amount(171_199)).toBe('17.1만')
  expect(amount(2_506_401)).toBe('251만')
  expect(spoken(130_000)).toBe('2분 10초')
  expect(until(3 * 3_600_000 + 12 * 60_000, 0)).toBe('3시간 12분 뒤 초기화')
  expect(cells('미나미 ok')).toBe(9)
  expect(cells('● “우이!” ▰▱ · …')).toBe(16)
  expect(fit('로그인 폼 구현', 9)).toBe('로그인 …')
  expect(cells(fit('바뀐 코드 다시 보기 · general-purpose', 20))).toBeLessThanOrEqual(20)
})

test("a report's first line comes without its markup and the name it opens with", () => {
  expect(firstLine('💜 제나: 찾았어요.\n\n- a\n- b')).toBe('찾았어요.')
  expect(firstLine('\n## 결과\n**파일 8개**를 봤습니다.')).toBe('결과')
  expect(firstLine('♥ 리브: `허우 유레카!` 버그 두 개')).toBe('허우 유레카! 버그 두 개')
  expect(firstLine('')).toBe('')
})

test('a tool call reads as what is being done, and as whose kind of work it is', () => {
  expect(actionOf('Edit', { file_path: '/w/src/view.tsx' })).toEqual({ member: 'minami', phrase: '고치는 중: view.tsx', past: '고침: view.tsx' })
  expect(actionOf('Read', { file_path: '/w/README.md' }).phrase).toBe('읽는 중: README.md')
  expect(actionOf('Grep', { pattern: 'drawPane' })).toEqual({ member: 'zena', phrase: '찾는 중: drawPane', past: '찾음: drawPane' })
  expect(actionOf('WebSearch', { query: '리센느 컴백' }).member).toBe('may')
  expect(actionOf('Bash', { command: 'npm test', description: '' })).toEqual({ member: 'liv', phrase: '실행 중: npm test', past: '실행함: npm test' })
  expect(actionOf('Bash', { command: 'ls -la src', description: '' }).member).toBe('zena')
  expect(actionOf('Bash', { command: 'fleet-run codex-build --spec a --out b', description: '' }).member).toBe('woni')
  expect(actionOf('Agent', { description: '리브: 다시 보기' }).phrase).toBe('맡기는 중: 리브: 다시 보기')
  expect(actionOf('mcp__docs__search', {}).phrase).toBe('search 쓰는 중')
  expect(actionOf('Bash', { command: 'x'.repeat(200), description: '' }).phrase.length).toBe(64)
})

test('a member at work goes through her poses and comes back to standing still', () => {
  for (const id of ['woni', 'liv', 'minami', 'may', 'zena'] as const) {
    const poses = new Set(Array.from({ length: 24 }, (_, beat) => frameOf(id, beat)))

    expect(poses.size).toBeGreaterThanOrEqual(3)
    expect(poses.has(iconOf(id))).toBe(true)
    expect(frameOf(id, 0)).toBe(iconOf(id))
    expect(cheerOf(id, 1)).toBe(iconOf(id))
    expect(cheerOf(id, 0)).not.toBe(iconOf(id))
    expect(iconOf(id).length).toBe(640)
  }
})

test('a launch is told from talk of one: a here-document body and a bare mention reserve nobody', () => {
  const fed = "python3 - <<'EOF'\nprint('fleet-run codex-build --spec a.spec.md --out a.out.md')\nEOF\ncd /w && tsc -p ."

  expect(findFleetRuns(fed)).toEqual([])
  expect(findFleetRuns('grep -n "fleet-run codex-scout" notes.md')).toEqual([])
  expect(findFleetRuns("cat <<EOF > /w/n.md\nnote\nEOF\nfleet-run grok-research --spec /w/x.spec.md --out /w/x.out.md").map(run => run.title)).toEqual(['x'])
})

test('a named member writing a document is at her own kind of work', () => {
  expect(roleOfAgent('general-purpose', 'README 작성')).toBe('조사')
  expect(roleOfAgent('general-purpose', '로그인 폼 작성')).toBe('구현')
})

test('a continued line is one launch, and a here-string or a shift is not a here-document', () => {
  expect(findFleetRuns('fleet-run codex-build \\\n  --spec /w/a.spec.md \\\n  --out /w/a.out.md').map(run => run.out)).toEqual(['/w/a.out.md'])
  expect(findFleetRuns('wc -l <<< "EOF"\nfleet-run codex-build --spec /w/a.spec.md --out /w/a.out.md\nEOF').length).toBe(1)
  expect(findFleetRuns("cat <<\\EOF\nfleet-run codex-build --spec /w/a.spec.md\nEOF\necho done")).toEqual([])
  expect(findFleetRuns('cat <<EOF\nEOF\nfleet-run agy-fast --spec /w/b.spec.md --out /w/b.out.md').length).toBe(1)
})

test('a shell command is the kind of work its first word is, and its description where that does not say', () => {
  expect(actionOf('Bash', { command: 'ls src', description: 'List files' }).member).toBe('zena')
  expect(actionOf('Bash', { command: 'grep -rn "check" src', description: '' }).member).toBe('zena')
  expect(actionOf('Bash', { command: 'cat fleet-run.sh', description: '' }).member).toBe('zena')
  expect(actionOf('Bash', { command: 'M=/w; cd $M && tsc -p . && claude plugin test .', description: '' }).member).toBe('liv')
  expect(actionOf('Bash', { command: 'claude plugin test .', description: '' }).member).toBe('liv')
  expect(actionOf('Bash', { command: 'python3 - <<EOF\nEOF', description: '카드 문구 수정 후 타입 검사' }).member).toBe('minami')
  expect(actionOf('Bash', { command: 'python3 run.py', description: '결과 검증' }).member).toBe('liv')
  expect(actionOf('Bash', { command: 'curl -s https://example.com', description: '' }).member).toBe('may')
  expect(actionOf('Bash', { command: 'orca terminal create --title a', description: '' }).member).toBe('woni')
  expect(actionOf('Bash', { command: 'orca terminal read --screen', description: '' }).member).toBe('zena')
  expect(actionOf('Bash', { command: 'cd /Users/me/.claude/dev-mods/abc/rescene && tsc -p . && claude plugin test .', description: '' }).phrase).toBe('실행 중: tsc -p .')
  expect(actionOf('Bash', { command: 'cat /Users/me/projects/app/src/hooks/view.tsx', description: '' }).phrase).toBe('실행 중: cat …/view.tsx')
})

test('what was asked reads without the tags a command wraps it in', () => {
  const goal = '<command-name>/goal</command-name>\n<command-message>goal</command-message>\n<command-args>밈을 더 연구해 줘</command-args>\n<local-command-stdout>Goal set: 밈을 더 연구해 줘</local-command-stdout>'

  expect(askOf(goal)).toBe('밈을 더 연구해 줘')
  expect(askOf('로그인 폼이 깨져요\n자세히 봐 주세요')).toBe('로그인 폼이 깨져요')
  expect(askOf('<local-command-stdout>ok</local-command-stdout>')).toBe('')
  expect(askOf('<agent-message from="a1">\n보고입니다</agent-message>')).toBe('')
  expect(askOf('[SYSTEM NOTIFICATION - NOT USER INPUT]\n<task-notification>x</task-notification>')).toBe('')
})

test("an Orca run is the kind of work its profile is for, and a general profile's is what its spec is named", () => {
  expect(roleOfRun('codex-scout', 'codex-audit')).toBe('탐색')
  expect(roleOfRun('grok-research', 'memes')).toBe('조사')
  expect(roleOfRun('codex-hard', 'codex-audit')).toBe('검토')
  expect(roleOfRun('codex-build', 'login-form')).toBe('구현')
  expect(roleOfRun('unknown', 'x')).toBe('구현')
})

test('no line on the screen is said twice by one member in one situation, and none is empty', () => {
  expect(SPOKEN.every(line => line.trim() !== '')).toBe(true)
  expect(SPOKEN.length).toBeGreaterThanOrEqual(80)
  expect(say('woni', 'fail', 1, '지휘')).toBe('미음')
  expect(say('zena', 'slow', 1, '탐색')).toBe('(도)도, (미)...미ㅎ')
})

test('a launch is where the shell runs it: a name handed to grep is not one, and each reads the variables set before it', () => {
  expect(findFleetRuns('grep "fleet-run codex-build --spec /w/a.md" notes.md')).toEqual([])
  expect(findFleetRuns('echo fleet-run codex-build --spec /w/a.md')).toEqual([])
  expect(findFleetRuns('# fleet-run codex-build --spec /w/a.md\nls')).toEqual([])
  expect(findFleetRuns('R=/a; fleet-run codex-build --spec $R/x.md --out $R/x.out.md; R=/b; fleet-run agy-pro --spec $R/y.md').map(run => run.spec)).toEqual(['/a/x.md', '/b/y.md'])
  expect(findFleetRuns("R=/a; fleet-run codex-build --spec '$R/x.md'")[0]?.spec).toBeUndefined()
  expect(findFleetRuns('cd /w && fleet-run codex-scout --spec=/w/s.md --out=/w/o.md')[0]).toMatchObject({ profile: 'codex-scout', spec: '/w/s.md', out: '/w/o.md' })
  expect(findFleetRuns('zsh -lc "fleet-run grok-research --spec /w/s.md --out /w/o.md"')[0]).toMatchObject({ profile: 'grok-research', rawSpec: '/w/s.md' })
  expect(isPlainLaunch('fleet-run codex-hard --cwd /w --spec /w/s.md --out /w/o.md')).toBe(true)
  expect(isPlainLaunch('fleet-run codex-hard --spec /w/s.md --out /w/o.md | tail -3')).toBe(false)
  expect(isPlainLaunch('cd /w && fleet-run codex-hard --spec /w/s.md')).toBe(false)
  expect(isPlainLaunch('fleet-run codex-hard --spec /w/s.md > /w/log')).toBe(false)
  expect(isPlainLaunch('fleet-run codex-hard --spec /w/s.md --out /w/o.md # go')).toBe(false)
  expect(isPlainLaunch('fleet-run codex-hard --spec /w/s.md --out /w/o.md\n# go')).toBe(false)
  expect(isPlainLaunch('fleet-run codex-hard --spec /w/s.md &')).toBe(false)
  // `-c` is a shell's alone; a loop's or a test's condition runs what it names.
  expect(findFleetRuns('grep -c "fleet-run codex-build --spec /w/a.md" log.txt')).toEqual([])
  expect(findFleetRuns('if fleet-run codex-build --spec /w/a.md; then echo ok; fi')).toHaveLength(1)
  expect(findFleetRuns('until ! fleet-run codex-build --spec /w/a.md; do sleep 1; done')).toHaveLength(1)
  expect(findFleetRuns('fleet-run codex-build --spec --out /w/b.md')).toEqual([])
})

test('a meta file with no exit code is one still being written', () => {
  expect(readMeta('{}')).toBeUndefined()
  expect(readMeta('{"status":"running"}')).toBeUndefined()
  expect(readMeta('{"exit_code":0,"model":"gpt-6-astra","seconds":12.4}')).toMatchObject({ isOk: true, note: 'gpt-6-astra · 12초' })
})

test('a kind of work given to a member is exchanged for hers, and the cast is what picks, acts and briefs go by', () => {
  const swapped = recast(CAST, 'liv', '구현')

  expect(swapped).toEqual({ 구현: 'liv', 검토: 'minami', 조사: 'may', 탐색: 'zena' })
  expect(roleIn(swapped, 'minami')).toBe('검토')
  expect(roleIn(swapped, 'woni')).toBe('지휘')
  // Her own already, or 원이's: nothing changes.
  expect(recast(CAST, 'liv', '검토')).toBe(CAST)
  expect(recast(CAST, 'woni', '구현')).toBe(CAST)

  expect(pickMember('구현', [], swapped)).toBe('liv')
  expect(pickMember('검토', [], swapped)).toBe('minami')
  // Busy, the next in line for that work who is free.
  expect(pickMember('구현', [task('liv', 'running')], swapped)).toBe('minami')
  expect(actionOf('Edit', { file_path: '/w/a.ts' }, swapped).member).toBe('liv')
  expect(actionOf('Bash', { command: 'npm test', description: '' }, swapped).member).toBe('minami')
  expect(actionOf('Agent', { description: 'x' }, swapped).member).toBe('woni')

  expect(leaderSection()).toContain('- ♥ 리브 (최종병기): 검토, 검증, 테스트. 남의 실수를 기가 막히게 잡아낸다')
  expect(leaderSection(swapped)).toContain('- ♥ 리브 (최종병기): 구현, 수정\n')
  expect(leaderSection(swapped)).toContain('- 💙 미나미 (올라운더): 검토, 검증, 테스트\n')
  expect(castBlock(swapped)).toContain('[리센느 역할 변경]')
  expect(aimBlock('liv', swapped)).toContain('리브(구현)')

  // What was kept between sessions is a cast only while each of the four has one kind of work.
  expect(castOf(swapped)).toEqual(swapped)
  expect(castOf({ 구현: 'liv', 검토: 'liv', 조사: 'may', 탐색: 'zena' })).toBe(CAST)
  expect(castOf({ 구현: 'woni', 검토: 'liv', 조사: 'may', 탐색: 'zena' })).toBe(CAST)
  expect(castOf('nonsense')).toBe(CAST)
  expect(castOf(undefined)).toBe(CAST)
})
