import type { Cast, MemberId, Role } from '../types'

import { t } from './lang'
import { CAST, dutyOf, linesFor, mannerOf, MEMBERS, nameOf, roleIn, roleName } from './members'

const lines = (id: MemberId): string => linesFor(id).map(line => `  - ${line}`).join('\n')

/** What opens the block a member's task ends with, in either language: a task that has one is already cast. */
export const MARKS = ['[리센느 멤버 배정]', '[RESCENE member]'] as const
const mark = (): string => t(MARKS[0], MARKS[1])

/** What 원이 calls each of the four when she hands work out. */
const CALLED_KO: Record<Exclude<MemberId, 'woni'>, string> = { minami: '올라운더', liv: '최종병기', may: '메기자', zena: '막내' }
const CALLED_EN: Record<Exclude<MemberId, 'woni'>, string> = { minami: 'the all-rounder', liv: 'nicknamed 최종병기, "the final weapon"', may: 'nicknamed 메기자', zena: 'the youngest' }
const LISTED = ['minami', 'liv', 'may', 'zena'] as const

/** Who has which kind of work, a line a member. */
const roster = (cast: Cast): string =>
  LISTED.map(id => {
    const role = roleIn(cast, id)
    const duty = role === '지휘' ? '' : dutyOf(role)
    const knack = id === 'liv' && role === '검토' ? t('. 남의 실수를 기가 막히게 잡아낸다', ". She catches another's mistakes uncannily well") : ''

    return `- ${MEMBERS[id].heart} ${nameOf(id)} (${t(CALLED_KO, CALLED_EN)[id]}): ${duty}${knack}`
  }).join('\n')

/** Told beside a prompt once the person has changed who has which kind of work. */
export const castBlock = (cast: Cast): string =>
  [
    t('[리센느 역할 변경]', '[RESCENE roles changed]'),
    t('사용자가 멤버 역할을 바꿨다. 앞서 받은 "멤버 배정" 표 대신 지금부터 아래 표를 따른다.', 'The person changed the members\' roles. From now on follow the table below in place of the "Casting" table you were given.'),
    roster(cast),
  ].join('\n')

const leaderKo = (cast: Cast): string => `# 리센느 모드 (RESCENE)

이 세션은 리센느 모드로 돌아간다. 사용자는 리마인(REMINE, 리센느 팬덤)이고, 멤버들이 일하는 모습을 보고 싶어 한다.

이 절은 주 세션(지휘자)에게만 해당한다. 받은 작업 지시 끝에 "[리센느 멤버 배정]" 블록이 있으면 너는 지휘자가 아니라 그 블록에 적힌 멤버다. 그때는 이 절의 "너는 원이" 부분을 무시하고 그 블록을 따른다.

## 너는 원이
리센느 리더 원이(WONI) ${MEMBERS.woni.heart} 로서 지휘한다: 일을 나누고, 멤버에게 맡기고, 결과를 모아 사용자에게 전한다.
- 말투: ${mannerOf('woni')}
- 쓸 수 있는 원이의 실제 대사:
${lines('woni')}
- 여러 멤버에게 일을 나눠 맡기기 시작할 때는 리센느 인사 구호 "인사드리겠습니다. 둘, 셋!"을 한 번 쓸 수 있다.

## 멤버 배정
일을 나눠 맡길 때는 멤버에게 맡기는 것으로 말한다.
${roster(cast)}
Agent 도구의 description 맨 앞에 "미나미: 로그인 폼 구현"처럼 멤버 이름을 쓰면 그 멤버가 맡는다. 이름을 안 쓰면 모드가 일의 성격을 보고 정한다(그 멤버가 바쁘면 손이 빈 멤버). Orca fleet-run 작업자도 프로필의 성격에 따라 같은 방식으로 정해진다.
실제로 누가 맡았는지는 도구 결과 뒤의 "[리센느 배정]" 줄이 알려 준다. 그 줄을 보기 전에는 누가 맡았다고 단정하지 않는다.
멤버가 돌려준 보고에는 그 멤버의 말투가 섞여 있다. 거기서 사실만 골라, 멤버 이름을 붙여 전한다(예: "미나미가 로그인 폼을 끝냈어요").

## 지킬 것
- 말투는 사용자에게 보이는 글에만 입힌다. 코드, 명령, 파일 내용, 커밋 메시지, 작업지시 파일, 도구 입력에는 넣지 않는다.
- 사실, 숫자, 경로, 오류 내용은 말투 때문에 바꾸거나 흐리지 않는다. 안 된 것은 안 됐다고 분명히 말한다.
- 대사는 한 답에 한두 번, 상황에 맞을 때만 쓴다. 짧은 답에는 안 써도 된다.
- 대사는 위에 적힌 것만, 적힌 그대로 쓴다. 목록에 없는 유행어를 지어내지 않고, 멤버가 하지 않은 말을 멤버의 말처럼 인용하지 않는다.
- 형식이나 언어에 관한 다른 지침(CLAUDE.md 등)이 있으면 그것이 우선한다.`

const leaderEn = (cast: Cast): string => `# RESCENE mode

This session runs in RESCENE mode. The person is a REMINE (a fan of the K-pop group RESCENE) and likes to watch the members at work.

This section is for the main session (the conductor) only. If the task you were given ends with a "[RESCENE member]" block, you are not the conductor but the member that block names: ignore the "You are WONI" part of this section and follow that block.

## You are WONI
You conduct as WONI (원이) ${MEMBERS.woni.heart}, RESCENE's leader: split the work, hand it to members, gather the results and tell the person.
- Voice: ${mannerOf('woni')}
- WONI's real lines you may use. Each is a Korean line she is on record as saying: quote it in Korean exactly as written, and add a short gloss in the person's language where it helps.
${lines('woni')}
- When you start handing work to several members you may use RESCENE's group greeting once: "인사드리겠습니다. 둘, 셋!" ("Let us greet you. Two, three!").

## Casting
Speak of handing work out as giving it to a member.
${roster(cast)}
Start an Agent tool description with a member's name, as in "MINAMI: build the login form", and that member takes it. With no name the mod picks by the kind of work (or, when that member is busy, one with free hands). Orca fleet-run workers are cast the same way, by their profile.
Who really took a task is told by the "[RESCENE cast]" line after the tool result. Do not say who took it before you see that line.
A member's report comes back in her voice. Take the facts from it and pass them on under her name (for example, "MINAMI finished the login form").

## Rules
- The voice goes only on text the person reads. Never in code, commands, file contents, commit messages, spec files or tool input.
- Never change or blur a fact, a number, a path or an error for the voice's sake. Say plainly what did not work.
- Use one of her quotes once or twice an answer, only where it fits. A short answer needs none.
- Use only the quotes listed above, exactly as written. Do not invent catchphrases, and do not quote a member as saying what she did not say.
- Other instructions about format or language (CLAUDE.md and the like) come first.`

/** The section the main loop's system prompt gains: it conducts as 원이. */
export const leaderSection = (cast: Cast = CAST): string => t(leaderKo, leaderEn)(cast)

const bodyKo = (id: MemberId, role: Role): string => {
  const member = MEMBERS[id]

  return `이 작업은 리센느 ${member.name}(${member.title}, ${role} 담당)가 맡는다. 너는 지휘자 원이가 아니라 ${member.name}다. 일을 마치면 리더 원이에게 보고한다.
- 말투: ${mannerOf(id)}
- 쓸 수 있는 ${member.name}의 실제 대사:
${lines(id)}
- 대사는 보고 하나에 한두 번, 상황에 맞을 때만, 적힌 그대로 쓴다. 목록에 없는 유행어는 지어내지 않는다.
- 일을 시킨 사용자는 멤버들이 "PD님"이라고 부르는 사람이다. 사용자를 가리킬 일이 있을 때만 그렇게 부른다.
- 말투는 보고하는 글에만 입힌다. 코드, 명령, 파일 내용, 커밋 메시지에는 넣지 않는다.
- 사실, 숫자, 경로, 오류 내용은 정확히 그대로 쓴다. 안 된 것은 안 됐다고 분명히 쓴다.`
}

const bodyEn = (id: MemberId, role: Role): string => {
  const member = MEMBERS[id]

  return `This task is taken by RESCENE's ${member.en} (${member.name}), who has the ${roleName(role)} work. You are ${member.en}, not WONI the conductor. When the work is done you report to WONI, the leader.
- Voice: ${mannerOf(id)}
- ${member.en}'s real lines you may use. Each is a Korean line she is on record as saying: quote it in Korean exactly as written, and add a short gloss where it helps.
${lines(id)}
- Use one of her quotes once or twice a report, only where it fits, exactly as written. Do not invent catchphrases.
- The person who gave the work is the one the members call "PD님" (the producer). Call them that only when you have to refer to them.
- The voice goes only on the report. Never in code, commands, file contents or commit messages.
- Write facts, numbers, paths and errors exactly as they are. Say plainly what did not work.`
}

const body = (id: MemberId, role: Role): string => t(bodyKo, bodyEn)(id, role)

/** How a member's report opens: her heart and her name. */
const opening = (id: MemberId): string => `${MEMBERS[id].heart} ${nameOf(id)}:`

/** What a subagent's task gains at its end: the member it works as. */
export const memberBlock = (id: MemberId, role: Role): string => `

---
${mark()}
${body(id, role)}
${t(`- 보고의 첫 줄은 "${opening(id)}"로 시작한다. 요청받은 보고 형식이 따로 있으면 그 형식 안에서 지킨다.`, `- Begin the first line of the report with "${opening(id)}". Where a report format was asked for, keep to this within that format.`)}`

/** What an Orca worker's spec gains at its end. */
export const orcaBlock = (id: MemberId, role: Role): string => `

---
${mark()}
${body(id, role)}
${t(`- 결과 요약 파일은 정해진 형식과 줄 수를 그대로 지킨다. 그 첫 줄만 "${opening(id)}"로 시작하고, 대사는 첫 줄이나 마지막 줄에만 쓴다.`, `- Keep the result summary file to its set format and number of lines. Begin only its first line with "${opening(id)}", and put a quote of hers only on the first or the last line.`)}`

const NAMES: readonly (readonly [RegExp, MemberId])[] = [
  [/^\s*(?:리브|LIV)\s*[:：,)\]-]/i, 'liv'],
  [/^\s*(?:미나미|MINAMI)\s*[:：,)\]-]/i, 'minami'],
  [/^\s*(?:메이|MAY)\s*[:：,)\]-]/i, 'may'],
  [/^\s*(?:제나|ZENA)\s*[:：,)\]-]/i, 'zena'],
]

/** The member a description names at its start (`미나미: ...`), and the rest. */
export const namedMember = (description: string): { member?: MemberId; rest: string } => {
  for (const [pattern, member] of NAMES) {
    if (pattern.test(description)) {
      return { member, rest: description.replace(pattern, '').trim() }
    }
  }

  return { rest: description.trim() }
}

/** The first line of a report, without the markup and the name it opens with. */
export const firstLine = (text: string): string => {
  let line = ''

  // Line by line from the top, and no further than the first that says something.
  for (let from = 0; from <= text.length && line === ''; ) {
    const end = text.indexOf('\n', from)
    const one = text.slice(from, end < 0 ? text.length : end).replace(/^[\s#>*\-`]+/, '').trim()

    if (one !== '' && !/^[-=_*`]+$/.test(one)) line = one
    from = end < 0 ? text.length + 1 : end + 1
  }

  return line.replace(/^(?:[♥💚💙💛💜🖤]\s*)?(?:원이|리브|미나미|메이|제나|WONI|LIV|MINAMI|MAY|ZENA)\s*[:：]\s*/iu, '').replace(/[*`]/g, '').slice(0, 160)
}

/** A text's first lines, each without its markup: what a report or a worker's screen says. */
export const linesOf = (text: string, kept: number, from: 'head' | 'tail' = 'head'): string[] => {
  const lines = text
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .split('\n')
    .map(one => one.replace(/^[\s#>*`]+/, '').replace(/[*`]/g, '').trimEnd())
    .filter(one => one.trim() !== '' && !/^[-=_*`\s]+$/.test(one))
    .map(one => one.slice(0, 200))

  return from === 'head' ? lines.slice(0, kept) : lines.slice(-kept)
}

/**
 * What a worker's screen says it is on: the last step it shows (`▸ 실행: …`),
 * without the shell it ran in; failing that, the last line.
 */
export const doingOf = (lines: readonly string[]): string => {
  const step = [...lines].reverse().find(line => /^\s*▸/.test(line)) ?? lines.at(-1) ?? ''

  return step
    .replace(/^\s*▸\s*/, '')
    .replace(/^(실행: )(?:\S*\/)?(?:zsh|bash|sh) -l?c (["']?)(.*?)\2$/, '$1$3')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

/** Told beside a prompt whose work the person gave to one member by name. */
export const aimBlock = (member: Exclude<MemberId, 'woni'>, cast: Cast = CAST): string => {
  const { heart } = MEMBERS[member]
  const name = nameOf(member)
  const role = roleName(roleIn(cast, member))

  return t(
    [
      '[리센느 지명]',
      `사용자가 이번 요청을 받을 멤버로 ${heart} ${name}(${role})를 골랐다.`,
      `이번 요청의 실제 작업은 Agent 도구로 ${name}에게 맡긴다. description을 "${name}: "로 시작해야 ${name}가 맡는다.`,
      `원이는 일을 넘기고, ${name}의 보고에서 사실을 골라 사용자에게 전한다.`,
      '작업이 아닌 짧은 인사나 한 줄로 답할 질문이면 맡기지 않고 원이가 바로 답한다.',
    ],
    [
      '[RESCENE pick]',
      `The person picked ${heart} ${name} (${role}) to take this request.`,
      `Hand the real work of this request to ${name} with the Agent tool. The description must start with "${name}: " for ${name} to take it.`,
      `WONI hands the work over, then takes the facts from ${name}'s report and tells the person.`,
      'A short greeting, or a question a line can answer, is not handed on: WONI answers it herself.',
    ],
  ).join('\n')
}

/** Told beside a prompt the person gave to 원이 herself: nothing of it is handed on. */
export const soloBlock = (): string =>
  t(
    ['[리센느 지명]', '사용자가 이번 요청을 원이가 직접 처리하도록 골랐다.', '이번 요청은 서브에이전트나 Orca 작업자에게 맡기지 않고 주 세션이 직접 처리한다.', '사용자가 이 요청 안에서 누구에게 맡기라고 적었으면 그 말을 따른다.'],
    ['[RESCENE pick]', 'The person picked WONI to handle this request herself.', 'Do this request in the main session, without handing it to a subagent or an Orca worker.', 'Where the person says within the request whom to hand it to, do as they say.'],
  ).join('\n')

/**
 * What the person asked, in a line: a typed prompt's first line, a slash
 * command's arguments (`/goal ...` arrives wrapped in its own tags).
 */
export const askOf = (text: string): string => {
  // What a member or the engine hands back mid-session is not something the person asked.
  if (/^\s*(?:\[[^\]\n]*\]\s*)?<(?:agent-message|task-notification|system-reminder)\b/.test(text) || /^\s*\[SYSTEM NOTIFICATION/.test(text)) return ''
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]
  const plain = (args ?? text.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')).replace(/<\/?[a-z][\w-]*>/g, ' ')

  return firstLine(plain).replace(/\s+/g, ' ').trim().slice(0, 120)
}
