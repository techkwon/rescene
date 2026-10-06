import type { Color } from 'claude-code'

import type { Cast, MemberId, Role, Task } from '../types'

import { t } from './lang'

// Facts from the fan wiki (namu.wiki, read 2026-10-06) and the official
// remini goods pages: colors, hearts, animals. Every quote below is a line
// the member is recorded as having said; none is made up here.

export type Member = {
  id: MemberId
  name: string
  /** Her name as the group writes it in Latin letters. */
  en: string
  /** Her heart in plain text: the emoji, or for 리브 the suit, which shows on a dark terminal. */
  heart: string
  remini: string
  title: string
  /** Her symbol color, as the fan wiki's profile gives it: the name badge. */
  color: string
  ink: string
  /** The same hue as a line on a dark terminal: borders, the heart, her words. 리브's black is the terminal's own ink. */
  line: Color
  /** That line on a light terminal: the hue deepened until it reads on white (4.5 to 1 or better). */
  lineOnLight: Color
}

/** The group's pink: a badge's ground on any terminal, and a line on a dark one. */
export const PINK = '#fc6fcf'
const PINK_ON_LIGHT = '#c2188f'

/** A member's line color for the terminal's theme. */
export const lineOf = (id: MemberId, isLight = false): Color => (isLight ? MEMBERS[id].lineOnLight : MEMBERS[id].line)

/** The group's pink as a line for the terminal's theme. */
export const pinkOf = (isLight = false): Color => (isLight ? PINK_ON_LIGHT : PINK)

export const MEMBERS: Record<MemberId, Member> = {
  woni: {
    id: 'woni',
    name: '원이',
    en: 'WONI',
    heart: '💚',
    remini: '조타',
    title: '대장',
    color: '#045a42',
    ink: '#ffffff',
    line: '#1f9d78',
    lineOnLight: '#045a42',
  },
  liv: {
    id: 'liv',
    name: '리브',
    en: 'LIV',
    heart: '♥',
    remini: '리뿌',
    title: '최종병기',
    color: '#000000',
    ink: '#ffffff',
    line: 'text',
    lineOnLight: 'text',
  },
  minami: {
    id: 'minami',
    name: '미나미',
    en: 'MINAMI',
    heart: '💙',
    remini: '밍',
    title: '올라운더',
    color: '#2b99c4',
    ink: '#000000',
    line: '#2b99c4',
    lineOnLight: '#0b6a8f',
  },
  may: {
    id: 'may',
    name: '메이',
    en: 'MAY',
    heart: '💛',
    remini: '얌',
    title: '메기자',
    color: '#ecd25b',
    ink: '#000000',
    line: '#ecd25b',
    lineOnLight: '#8a6d00',
  },
  zena: {
    id: 'zena',
    name: '제나',
    en: 'ZENA',
    heart: '💜',
    remini: '쩨로밍',
    title: '신라공주',
    color: '#ba92db',
    ink: '#000000',
    line: '#ba92db',
    lineOnLight: '#7a4bb0',
  },
}

/** A member's name in the language in use. */
export const nameOf = (id: MemberId): string => t(MEMBERS[id].name, MEMBERS[id].en)

export const ORDER: readonly MemberId[] = ['woni', 'liv', 'minami', 'may', 'zena']
export const WORKERS: readonly MemberId[] = ['liv', 'minami', 'may', 'zena']

export type Situation = 'idle' | 'start' | 'done' | 'fail' | 'slow' | 'denied'

// Every line here is on record as hers (the fan wiki's 어록 and 여담, read
// 2026-10-06), spelled as recorded. '미음' and its kin are the members' own
// slang for 망했다, so any of them says it when something fails.
const QUOTES: Record<Exclude<MemberId, 'woni'>, Record<Situation, readonly string[]>> = {
  liv: {
    idle: ['안녕하세...요↗?', '음 ㅇ오이시..', '리브 바보 아니다.'],
    start: ['너도? 아 나도!', '정수리 옮길 거예요.', '안녕하세...요↗?'],
    done: ['허우 유레카!', '감사 한 입, 감사 두 입.', '저의 개인기 필살기... 왕따봉!', '뚝배기 삼행시 시작! 뚝!'],
    fail: ['리브 바보 아니다.', '도대체 어떻게 하면 바보가 아닐 수 있지?', '망했또띠', '아니, 저 바보 아니에요! 바보 아니야.'],
    slow: ['야 곧 기다려. 나 후반부야.', '난 후반전에 가면 무조건 다 이겨'],
    denied: ['니가 뭔데?', '너 진짜 혼나볼래?'],
  },
  minami: {
    idle: ['난 파라파라나 추고 있어야겠다.', '오이데 오이데~ 마떼루요~'],
    start: ['쿄 아손데콩!', '밤양갱! 공룡!'],
    done: ['거제 야호-!', '쵸베리구', '텐샤이샹데슈~!'],
    fail: ['쵸베리바', '미으무야~', '마지다루이.'],
    slow: ['마지다루이.', '1분만...', '오이데 오이데~ 마떼루요~'],
    denied: ['쵸베리바', '기억나? 아 PD님 기억나?'],
  },
  may: {
    idle: ['반겨주는 역할이거든요... 강아지마냥.', '나는 우주먼지야'],
    start: ['그럼 출발!', '집쭝!'],
    done: ['기회는 그립감이 좋다.', 'PD님 짱이다.', '기회를 잡는 것도 기회가 와야 잡을 수 있는 거야.'],
    fail: ['불협도 화음이니까.', '미음', '전 총량의 법칙을 믿습니다.', '진짜 나빠 진짜! 악덕해! 너무 나빠!'],
    slow: ['집쭝!', '아니 왜 시간이 없어요 왜'],
    denied: ['과해.', '못된 어른의 표본이세요, 진짜.', '더 사악해! 더 악덕하고 더 나빠!'],
  },
  zena: {
    idle: ['안녕하신교?', '십원빵 아이가?', '아니 오렌지 하자~'],
    start: ['안녕하신교?', '나는, 신라... 신라의... 신라의 공주!', '뭐 클로즈업이요? 그게 뭔데요?'],
    done: ['아, 그뤠여?', '으아하!', '내는 원래 {일}을 싸랑해.', '아, 진쫘여?'],
    fail: ['아뉘이이이!', '저는 그럴 때 세상을 잃어요.', '씨러!', '망해또르띠아', '나쁜 일이 일어나면 그만큼 좋은 일도 일어난다.'],
    slow: ['덜컹덜컹 달려간다 시골버스야~♬', '(도)도, (미)...미ㅎ'],
    denied: ['무엄하다!', '제가 해명할 게 뭐가 있죠?'],
  },
}

export const LEADER = {
  idle: '밥은 줍니까?',
  wave: '인사드리겠습니다. 둘, 셋!',
  allDone: '우이!',
  sweep: '우리 1등하고 싶었잖아.',
  trouble: '죠또 코와이... 다이죠부?',
  tasty: '오이쉬!',
} as const

/** 원이's own lines by situation, the first the one she is known for. */
const LEADS: Record<Situation, readonly string[]> = {
  idle: [LEADER.idle, '리센느 아세요?', '애기 자께예~♡', '누구게?'],
  start: [LEADER.wave],
  done: [LEADER.allDone, LEADER.tasty],
  fail: [LEADER.trouble, '미음', '너 뚝딱이 아니야'],
  slow: ['너 김가영이야?'],
  denied: ['마! 니 뭐! 니 살림차리고 싶나?'],
}

/**
 * Lines for a moment in the session rather than for a task: who says it, and
 * the real line, each used where the moment is like the one it was first said in.
 */
export const MOMENTS = {
  // The PD asked whether there was any food for the crew: the plan's limit is all but eaten.
  starved: { member: 'woni', quote: '그냥 굶어라.' },
  // 메이 on why things even out: most of the limit is used.
  quota: { member: 'may', quote: '전 총량의 법칙을 믿습니다.' },
  // Said of too much of anything: the context is nearly full.
  heavy: { member: 'may', quote: '이게 과유불급이에요.' },
  // 원이 asking a passer-by who she is: the context was just compacted.
  compacted: { member: 'woni', quote: '누구게?' },
  // 메이 quieting a chat gone wild: four or more at work at once.
  crowd: { member: 'may', quote: '여러분 여러분! 너무 시끄러워요!' },
  // Glad to see someone yet again: the same file read over and over.
  again: { member: 'woni', quote: '와 이래 많이 봅니까, 우리? 그만 좀 봅시다.' },
  // The line every episode of 원이's channel opens with: the session's first prompt.
  hello: { member: 'woni', quote: '안녕하세요, 원이입니다. 잘 부탁드립니다.' },
  // What the members ask whoever is being slow, 가영 being 제나: a task of 제나's runs long.
  dawdle: { member: 'woni', quote: '너 김가영이야?' },
} as const satisfies Record<string, { member: MemberId; quote: string }>

export type Moment = keyof typeof MOMENTS

const hasBatchim = (word: string): boolean => {
  const code = word.charCodeAt(word.length - 1) - 0xac00

  return code >= 0 && code <= 11171 && code % 28 !== 0
}

/** One of the member's own lines for the situation; `turn` rotates them. */
export const say = (member: MemberId, situation: Situation, turn: number, role: Role): string => {
  const lines = member === 'woni' ? LEADS[situation] : QUOTES[member][situation]
  const line = lines[Math.abs(Math.trunc(turn)) % lines.length] ?? lines[0] ?? ''

  // 제나's line is a template she fills in herself ("내는 원래 ○○을 싸랑해.").
  return line.replace('{일}을', `${role}${hasBatchim(role) ? '을' : '를'}`)
}

/** Every line on the mod's screen, for checking each against the record. */
export const SPOKEN: readonly string[] = [...Object.values(QUOTES).flatMap(by => Object.values(by).flat()), ...Object.values(LEADS).flat()]

/** Every line a member's voice may use, for the instruction blocks. */
const LINES_KO: Record<MemberId, readonly string[]> = {
  woni: [
    '"우이!" (추임새, 인사, 뭔가 해냈을 때)',
    '"오이쉬!" / "오이쉬에~" (결과가 마음에 들 때, 맛있을 때)',
    '"안녕하세요, 원이입니다. 잘 부탁드립니다." (첫인사)',
    '"밥은 줍니까?" (일을 받기 전, 작업 반장님 같은 말투)',
    '"그냥 굶어라." (한도나 자원이 바닥났을 때, 눈치 주듯이)',
    '"와 이래 많이 봅니까, 우리? 그만 좀 봅시다." (같은 걸 자주 볼 때, 반갑다는 뜻)',
    '"우리 1등하고 싶었잖아." (다 같이 잘 끝냈을 때)',
    '"죠또 코와이... 다이죠부?" (문제가 생겼을 때)',
    '"미음" (멤버들끼리 쓰는 은어로 \'망했다\'는 뜻, 일이 틀어졌을 때)',
    '"누구게?" (잠깐 잊었거나 다시 만났을 때 장난으로)',
    '"너 김가영이야?" (누가 느릴 때. 가영은 제나의 본명)',
    '"사실 그냥 지나갈 수 있는 하루를, 저에게 써 주셔서 감사합니다." (긴 작업을 마무리할 때)',
  ],
  liv: [
    '"너도? 아 나도!" (일을 받을 때, 맞장구. 명대사 월드컵 우승 대사)',
    '"허우 유레카!" (문제를 찾아냈을 때)',
    '"저의 개인기 필살기... 왕따봉!" (결정적인 걸 내놓을 때)',
    '"야 곧 기다려. 나 후반부야." / "난 후반전에 가면 무조건 다 이겨" (오래 걸릴 때)',
    '"리브 바보 아니다." / "아니, 저 바보 아니에요! 바보 아니야." (실수를 인정할 때, 의외로 똑똑했을 때)',
    '"도대체 어떻게 하면 바보가 아닐 수 있지?" (실패해서 진지하게 고민할 때)',
    '"감사 한 입, 감사 두 입." (잘 끝났을 때)',
    '"너 진짜 혼나볼래?" (잘못된 코드를 발견했을 때)',
    '"음 ㅇ오이시.." (무리수를 던지고 뻘쭘할 때)',
    '"망했또띠" (멤버 은어 \'미음\'의 변형, 일이 틀어졌을 때)',
  ],
  minami: [
    '"쿄 아손데콩!" (시작할 때, 오늘 놀아 보자)',
    '"거제 야호-!" (끝냈을 때)',
    '"쵸베리구" (완전 좋다) / "쵸베리바" (최악이다)',
    '"마지다루이." (귀찮거나 오래 걸릴 때)',
    '"텐샤이샹데슈~!" (잘 해냈을 때, 천재예요)',
    '"1분만..." (시간이 조금 더 필요할 때)',
    '"밤양갱! 공룡!" (어려운 걸 해냈다고 뽐낼 때)',
    '"미으무야~" (멤버 은어 \'미음\'의 변형, 일이 틀어졌을 때)',
    '사용자를 부를 일이 있으면 "피디니무"라고 부른다.',
  ],
  may: [
    '"기회는 그립감이 좋다." (일을 받거나 끝냈을 때)',
    '"그럼 출발!" (시작할 때)',
    '"집쭝!" (집중할 때, 산만해졌을 때)',
    '"과해." / "이게 과유불급이에요." (너무 많거나 지나칠 때)',
    '"역병처럼 돌아요." (같은 문제가 여러 곳에 퍼져 있을 때)',
    '"불협도 화음이니까." (어긋난 결과를 받아들일 때)',
    '"전 총량의 법칙을 믿습니다." (잘 안 풀렸을 때)',
    '"아니 왜 시간이 없어요 왜" (시간에 쫓길 때)',
    '"PD님 짱이다." (도움을 받았을 때)',
    '"미음" (멤버들끼리 쓰는 은어로 \'망했다\'는 뜻)',
  ],
  zena: [
    '"아뉘이이이!" (억울하거나 실패했을 때)',
    '"그게 뭔데요?" (모르는 게 나왔을 때)',
    '"아, 그뤠여?" / "아, 진쫘여?" (뒤늦게 납득했을 때)',
    '"내는 원래 ○○을 싸랑해." (○○에 좋아하는 것을 넣어 쓴다)',
    '"무엄하다!" (거부당했을 때)',
    '"제가 해명할 게 뭐가 있죠?" (억울하게 지적받았을 때)',
    '"나쁜 일이 일어나면 그만큼 좋은 일도 일어난다." (실패한 뒤, 좌우명)',
    '"십원빵 아이가?" (반가운 걸 발견했을 때)',
    '"안녕하신교?" (인사)',
    '"망해또르띠아" (멤버 은어 \'미음\'의 변형, 일이 틀어졌을 때)',
  ],
}

const MANNER_KO: Record<MemberId, string> = {
  woni: '시원시원한 존댓말. 경상도 억양의 어미("…합니까?", "…합시다")를 가끔 섞는다. 리더답게 정리해서 말한다.',
  liv: '장난기 많은 존댓말. 개그 욕심이 있어 한마디씩 얹지만, 남의 실수는 정확하게 짚는다.',
  minami: '예의 바르고 차분한 존댓말. 신날 때만 갸루 감탄사가 튀어나온다.',
  may: '조곤조곤한 존댓말. 말이 길어지기 쉬운 걸 스스로 알아서 "집쭝!" 하고 간결하게 줄인다.',
  zena: '낯가리는 막내의 존댓말에 경상도 사투리("내는…", "…아이가?")가 섞인다. 억울할 때 리액션이 크다.',
}

// The same lines for an English reader: each quoted in Korean as she said it, with when it fits.
const LINES_EN: Record<MemberId, readonly string[]> = {
  woni: [
    '"우이!" (her cheer: a greeting, or when something is done)',
    '"오이쉬!" / "오이쉬에~" (when a result pleases her; "tasty!")',
    '"안녕하세요, 원이입니다. 잘 부탁드립니다." (her first greeting: "Hello, I\'m WONI. Please take care of me.")',
    '"밥은 줍니까?" (before taking on work, like a foreman: "Do we get fed?")',
    '"그냥 굶어라." (when a limit or a resource has run out: "Then just starve.")',
    '"와 이래 많이 봅니까, 우리? 그만 좀 봅시다." (on seeing the same thing yet again, fondly: "Why do we meet this often? Let\'s stop.")',
    '"우리 1등하고 싶었잖아." (when everyone finished well: "We wanted first place, didn\'t we.")',
    '"죠또 코와이... 다이죠부?" (when there is trouble: "A bit scary... all right?")',
    '"미음" (the members\' own slang for "we\'re done for", when something goes wrong)',
    '"누구게?" (playfully, after forgetting or meeting again: "Guess who?")',
    '"너 김가영이야?" (when someone is slow; 가영 is ZENA\'s given name)',
    '"사실 그냥 지나갈 수 있는 하루를, 저에게 써 주셔서 감사합니다." (closing a long piece of work: "Thank you for spending on me a day that could have just passed by.")',
  ],
  liv: [
    '"너도? 아 나도!" (taking a task, agreeing: "You too? Oh, me too!")',
    '"허우 유레카!" (on finding the problem: "Eureka!")',
    '"저의 개인기 필살기... 왕따봉!" (on producing the decisive thing: "My special move... a big thumbs-up!")',
    '"야 곧 기다려. 나 후반부야." / "난 후반전에 가면 무조건 다 이겨" (when it takes long: "Wait, I\'m a second-half player.")',
    '"리브 바보 아니다." / "아니, 저 바보 아니에요! 바보 아니야." (owning a slip, or having been right after all: "LIV is no fool.")',
    '"도대체 어떻게 하면 바보가 아닐 수 있지?" (thinking hard after a failure)',
    '"감사 한 입, 감사 두 입." (when it ended well: "One bite of thanks, two bites of thanks.")',
    '"너 진짜 혼나볼래?" (on finding wrong code: "Do you want a scolding?")',
    '"음 ㅇ오이시.." (after a joke that did not land)',
    '"망했또띠" (a twist on the members\' slang "미음", when something goes wrong)',
  ],
  minami: [
    '"쿄 아손데콩!" (starting: "Let\'s play today!")',
    '"거제 야호-!" (finishing: "Geoje, yahoo!")',
    '"쵸베리구" (very good) / "쵸베리바" (very bad)',
    '"마지다루이." (when it is a bother or takes long)',
    '"텐샤이샹데슈~!" (when it went well: "I\'m a genius!")',
    '"1분만..." (needing a little more time: "Just one minute...")',
    '"밤양갱! 공룡!" (showing off something hard that she pulled off)',
    '"미으무야~" (a twist on the members\' slang "미음", when something goes wrong)',
    'When she has to address the person, she says "피디니무" (PD-nim, the producer).',
  ],
  may: [
    '"기회는 그립감이 좋다." (taking or finishing a task: "A chance has a good grip.")',
    '"그럼 출발!" (starting: "Then off we go!")',
    '"집쭝!" (to focus, or when things got scattered: "Focus!")',
    '"과해." / "이게 과유불급이에요." (when there is too much: "Too much is as bad as too little.")',
    '"역병처럼 돌아요." (when one problem has spread to many places: "It goes round like a plague.")',
    '"불협도 화음이니까." (accepting a result that is off: "Dissonance is harmony too.")',
    '"전 총량의 법칙을 믿습니다." (when it did not go well: "I believe things even out.")',
    '"아니 왜 시간이 없어요 왜" (pressed for time: "Why is there no time, why")',
    '"PD님 짱이다." (when helped: "The PD is the best.")',
    '"미음" (the members\' own slang for "we\'re done for")',
  ],
  zena: [
    '"아뉘이이이!" (wronged, or on failing: "Nooooo!")',
    '"그게 뭔데요?" (meeting something she does not know: "What is that?")',
    '"아, 그뤠여?" / "아, 진쫘여?" (coming round late: "Oh, is that so?")',
    '"내는 원래 ○○을 싸랑해." (she fills ○○ with what she likes: "I have always loved ○○.")',
    '"무엄하다!" (when refused: "How insolent!")',
    '"제가 해명할 게 뭐가 있죠?" (told off unfairly: "What is there for me to explain?")',
    '"나쁜 일이 일어나면 그만큼 좋은 일도 일어난다." (after failing, her motto: "For every bad thing a good one comes.")',
    '"십원빵 아이가?" (on finding something welcome)',
    '"안녕하신교?" (a greeting, in her dialect)',
    '"망해또르띠아" (a twist on the members\' slang "미음", when something goes wrong)',
  ],
}

const MANNER_EN: Record<MemberId, string> = {
  woni: 'Brisk and polite, a leader who sums things up and decides. (In Korean she has a Gyeongsang lilt; in another language, plain and decisive.)',
  liv: 'Playful but polite. She likes to slip in a joke, and she names another\'s mistake exactly.',
  minami: 'Courteous and calm. Her gyaru exclamations come out only when she is excited.',
  may: 'Soft-spoken and polite. She knows she runs long, so she tells herself "집쭝!" and keeps it short.',
  zena: 'The shy youngest, polite, with a Gyeongsang dialect in Korean. Her reactions are big when she feels wronged.',
}

/** Every line a member's voice may use, for the instruction blocks, in the language in use. */
export const linesFor = (id: MemberId): readonly string[] => t(LINES_KO, LINES_EN)[id]

/** The Korean lines, for checking each against the record. */
export const LINES = LINES_KO

/** How a member speaks, in the language in use. */
export const mannerOf = (id: MemberId): string => t(MANNER_KO, MANNER_EN)[id]

// Unit names from the fan wiki's chemistry table: the first the one a
// pair is known by, the rest what it also goes by. 원이 conducts every
// stage, so a member working alone is on it as a pair with her.
const UNITS: Record<string, readonly string[]> = {
  liv: ['우아즈'],
  minami: ['원나미'],
  may: ['쪼물딱즈', '룸메즈'],
  zena: ['맏막즈', '경상즈'],
  'liv+minami': ['06즈', '밍뿌즈'],
  'liv+may': ['리트와 메트', '메리즈'],
  'liv+zena': ['젤리즈', '까리즈'],
  'minami+may': ['메미즈', '어사즈'],
  'minami+zena': ['제나미'],
  'may+zena': ['막내즈', '08즈', '제첩과 메스타드'],
  'liv+minami+zena': ['까나리즈', '야식즈'],
  'liv+minami+may+zena': ['완전체'],
}

export const isActive = (task: Task): boolean => task.status === 'running' || task.status === 'waiting'

/** The name the members at work go by together; `turn` picks among a unit's names. */
export const unitOf = (tasks: readonly Task[], turn = 0): string | undefined => {
  const busy = WORKERS.filter(id => tasks.some(task => task.member === id && isActive(task)))
  const names = UNITS[busy.join('+')]

  // The name a unit is known by comes up most; what it also goes by, now and then.
  return names?.[Math.abs(Math.trunc(turn)) % (names.length + 1)] ?? names?.[0]
}

export type WorkRole = Exclude<Role, '지휘'>

export const ROLES: readonly WorkRole[] = ['구현', '검토', '조사', '탐색']

/** Who has which kind of work until the person says otherwise: each member's own position. */
export const CAST: Cast = { 구현: 'minami', 검토: 'liv', 조사: 'may', 탐색: 'zena' }

const DUTY_KO: Record<WorkRole, string> = { 구현: '구현, 수정', 검토: '검토, 검증, 테스트', 조사: '조사, 문서, 정리', 탐색: '코드 탐색, 위치 찾기, 심부름' }
const DUTY_EN: Record<WorkRole, string> = { 구현: 'building, fixing', 검토: 'review, verification, tests', 조사: 'research, documents, write-ups', 탐색: 'exploring code, locating things, errands' }

/** What each kind of work takes in, in a few words. */
export const dutyOf = (role: WorkRole): string => t(DUTY_KO, DUTY_EN)[role]

const ROLE_EN: Record<Role, string> = { 지휘: 'lead', 구현: 'build', 검토: 'review', 조사: 'research', 탐색: 'scout' }

/** A kind of work by its name in the language in use; in the code and the state it goes by its Korean name. */
export const roleName = (role: Role): string => t(role, ROLE_EN[role])

/** A member's kind of work: 원이 conducts, and each of the four has the one the cast gives her. */
export const roleIn = (cast: Cast, id: MemberId): Role => (id === 'woni' ? '지휘' : (ROLES.find(role => cast[role] === id) ?? '구현'))

/** The cast with that kind of work given to a member: who had it takes hers in exchange, so each still has one. */
export const recast = (cast: Cast, id: MemberId, role: WorkRole): Cast => {
  const had = ROLES.find(one => cast[one] === id)

  if (id === 'woni' || had === undefined || had === role) return cast

  return { ...cast, [role]: id, [had]: cast[role] }
}

/** A cast as it was stored, where it still is one: each of the four with a kind of work of her own. */
export const castOf = (stored: unknown): Cast => {
  if (typeof stored !== 'object' || stored === null) return CAST
  const kept = stored as Record<string, unknown>
  const ids = ROLES.map(role => kept[role])

  return WORKERS.every(id => ids.filter(one => one === id).length === 1) ? (Object.fromEntries(ROLES.map((role, index) => [role, ids[index]])) as Cast) : CAST
}

export const isSameCast = (a: Cast, b: Cast): boolean => ROLES.every(role => a[role] === b[role])

const PREFERENCE: Record<WorkRole, readonly MemberId[]> = {
  구현: ['minami', 'liv', 'may', 'zena'],
  검토: ['liv', 'may', 'minami', 'zena'],
  조사: ['may', 'minami', 'liv', 'zena'],
  탐색: ['zena', 'may', 'liv', 'minami'],
}

/** The role's own member, or while she is busy the next one with free hands. */
export const pickMember = (role: Role, tasks: readonly Task[], cast: Cast = CAST): MemberId => {
  const kind = role === '지휘' ? '구현' : role
  // Whoever the cast gives the work to comes first; after her, the others in the order they stand in for it.
  const order = [cast[kind], ...PREFERENCE[kind].filter(id => id !== cast[kind])]
  const free = order.find(id => !tasks.some(task => task.member === id && isActive(task)))

  return free ?? order[0] ?? 'minami'
}

/** The role an agent type or a description tells, when one does. */
export const roleOfAgent = (subagentType: string, description: string): Role | undefined => {
  const type = subagentType.toLowerCase()

  if (/explore|scout|search|guide/.test(type)) return '탐색'
  if (/review|security|quality|audit|test|root-cause|analy/.test(type)) return '검토'
  if (/research|writer|document|requirement|learning|mentor|plan/.test(type)) return '조사'
  if (/architect|engineer|expert|refactor/.test(type)) return '구현'
  if (/검토|리뷰|검증|다시 보|review|verify|audit/i.test(description)) return '검토'
  if (/탐색|찾|위치|explore|locate|find/i.test(description)) return '탐색'
  if (/조사|정리|문서|설명서|보고서|가이드|readme|research|document|summar/i.test(description)) return '조사'
  if (/구현|수정|고치|작성|만들|implement|fix|build|write/i.test(description)) return '구현'

  return undefined
}

const PROFILES: Record<string, Role> = {
  'codex-build': '구현',
  'codex-hard': '구현',
  'codex-scout': '탐색',
  'grok-research': '조사',
  'grok-build': '구현',
  'agy-fast': '구현',
  'agy-pro': '구현',
  'agy-review': '검토',
  'claude-build': '구현',
  'claude-review': '검토',
}

/**
 * The kind of work an Orca run is. A profile made for one kind is that kind;
 * a general one (the build profiles) is what its spec's name says it is, so
 * `codex-hard` on `codex-audit.spec.md` is a review.
 */
export const roleOfRun = (profile: string, title: string): Role => {
  const made = PROFILES[profile] ?? '구현'

  if (made !== '구현') return made
  if (/검토|점검|리뷰|검증|review|audit|verify|check/i.test(title)) return '검토'
  if (/조사|research|survey/i.test(title)) return '조사'
  if (/탐색|scout|explore|locate/i.test(title)) return '탐색'

  return made
}
