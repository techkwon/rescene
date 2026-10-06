// The language the mod speaks: Korean to a Korean reader, English to anyone else.

export type Lang = 'ko' | 'en'

// One session, one reader: every text the mod writes is in the language held here.
let lang: Lang = 'ko'

export const langNow = (): Lang => lang

export const setLang = (next: Lang): void => {
  lang = next
}

/** One of two texts, by the language in use. */
export const t = <T>(ko: T, en: T): T => (lang === 'en' ? en : ko)

// Korean as a setting may name it, anywhere in what it says: `ko`, `ko_KR`, `Korean`, `한국어`, `한국말`, `Answer in Korean`.
const NAMES_KOREAN = /(?:^|[^a-z])(?:ko|kr|kor|korean)(?:[^a-z]|$)|한국|한글/i

/** A language asked for by name; nothing for `auto`, or for a word that names none. */
export const pinned = (asked: unknown): Lang | undefined => {
  const word = typeof asked === 'string' ? asked.trim().toLowerCase() : ''

  if (/^(?:ko|kr|kor|korean|한국어|한국말|한글)$/.test(word)) return 'ko'
  if (/^(?:en|eng|english|영어)$/.test(word)) return 'en'

  return undefined
}

export const hasHangul = (text: string): boolean => /[가-힣]/.test(text)

/** What tells whether the reader is Korean, strongest first. */
export type Signs = {
  /** The language Claude Code is set to answer in, as its settings show it: `Default (English)` where none is set. */
  setting?: string
  /** `LC_ALL`, `LC_MESSAGES`, `LANG`, as the session has them. */
  env?: readonly (string | undefined)[]
  /** The locale and the time zone the runtime reports. */
  locale?: string
  timeZone?: string
}

/**
 * Korean for a reader the signs say is Korean, English for anyone else. A
 * terminal's `LANG` is often left English on a Korean machine, so one that
 * is not Korean settles nothing: the locale and the clock are asked next.
 */
export const langOf = (signs: Signs): Lang => {
  const setting = signs.setting?.trim() ?? ''

  // Left at its default, the setting names no language the person chose.
  if (setting !== '' && !/^default\b/i.test(setting)) return NAMES_KOREAN.test(setting) ? 'ko' : 'en'
  if ((signs.env ?? []).some(value => /^ko(?:[_.@-]|$)/i.test(value ?? ''))) return 'ko'
  if (/^ko(?:-|$)/i.test(signs.locale ?? '')) return 'ko'

  return signs.timeZone === 'Asia/Seoul' ? 'ko' : 'en'
}

/** The runtime's own locale and time zone, where it has them. */
export const runtimeSigns = (): Pick<Signs, 'locale' | 'timeZone'> => {
  try {
    const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions()

    return { locale, timeZone }
  } catch {
    return {}
  }
}

// Names a reader of any language may write in Hangul: they say nothing of what the reader reads.
const NAMES_KO = /리센느|리마인|원이|리브|미나미|메이|제나/g

/**
 * Whether a text is written in Korean: beyond the group's and the members'
 * names, more syllables of Hangul than words in Latin letters. A Korean
 * sentence about code is (`view.tsx 의 fit 함수 고쳐 줘`); a Korean word asked
 * about in English is not (`what does 감사합니다 mean in this log?`).
 */
export const isKorean = (text: string): boolean => {
  const rest = text.replace(NAMES_KO, '')
  const syllables = rest.match(/[가-힣]/g)?.length ?? 0

  return syllables >= 2 && syllables > (rest.match(/[A-Za-z]+/g)?.length ?? 0)
}
