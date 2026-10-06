import type { MemberId } from '../types'

// Small pixel icons of each member's remini animal, drawn for this mod (not
// the official character art): ten pixels by eight, two pixels to a cell.
// They move while their member works: `$.ui.blit` repaints the cells in place.

// A sprite is a handful of poses and the order she moves through them while
// she works: `A` is her standing still, the others a bob, a hop, a blink.
type Sprite = {
  poses: Readonly<Record<string, readonly string[]>>
  colors: Readonly<Record<string, number>>
  /** The colors that differ on a light terminal: what is white or pale there would not show. */
  light?: Readonly<Record<string, number>>
  /** One pose a beat, round and round, while she is at work. */
  loop: string
  /** The pose she alternates with `A` when a task of hers has just ended well. */
  hop: string
}

const SPRITES: Record<MemberId, Sprite> = {
  // 조타: a cat with a headset, bobbing to the count.
  woni: {
    poses: {
      A: ['.K......K.', '.KGGGGGGK.', 'GKKKKKKKKG', 'GKYKKKKYKG', 'GKKKPPKKKG', '.KKKKKKKK.', '..KKKKKK..', '..KK..KK..'],
      B: ['..........', '.K......K.', '.KGGGGGGK.', 'GKKKKKKKKG', 'GKYKKKKYKG', 'GKKKPPKKKG', '.KKKKKKKK.', '.KK....KK.'],
      C: ['.K......K.', '.KGGGGGGK.', 'GKKKKKKKKG', 'GKDKKKKDKG', 'GKKKPPKKKG', '.KKKKKKKK.', '..KKKKKK..', '..KK..KK..'],
      D: ['K........K', '.KGGGGGGK.', 'GKKKKKKKKG', 'GKYKKKKYKG', 'GKKPPPPKKG', '.KKKKKKKK.', '..KKKKKK..', '..KK..KK..'],
    },
    colors: { K: 0x5a5a5a, G: 0x1f9d78, Y: 0xf5d94e, P: 0xf4a6c8, D: 0x3d3d3d },
    light: { G: 0x045a42 },
    loop: 'AABBAABBADDBAABBACBB',
    hop: 'B',
  },
  // 리뿌: a hamster, cheeks going as she chews a thing over.
  liv: {
    poses: {
      A: ['.WW....WW.', 'WPWWWWWWPW', 'WWWWWWWWWW', 'WWKWWWWKWW', 'WCWWPPWWCW', 'WWWWWWWWWW', '.WWWWWWWW.', '..WW..WW..'],
      B: ['.WW....WW.', 'WPWWWWWWPW', 'WWWWWWWWWW', 'WWKWWWWKWW', 'CCWWPPWWCC', 'WCWWWWWWCW', '.WWWWWWWW.', '..WW..WW..'],
      C: ['..........', '.WW....WW.', 'WPWWWWWWPW', 'WWWWWWWWWW', 'WWKWWWWKWW', 'WCWWPPWWCW', 'WWWWWWWWWW', '.WWW..WWW.'],
      D: ['.WW....WW.', 'WPWWWWWWPW', 'WWWWWWWWWW', 'WWDWWWWDWW', 'WCWWPPWWCW', 'WWWWWWWWWW', '.WWWWWWWW.', '..WW..WW..'],
    },
    colors: { W: 0xf2f2f2, P: 0xf4a6c8, K: 0x222222, C: 0xf9c9dc, D: 0xb4b4b4 },
    light: { W: 0xb7aca3, P: 0xe07aa6, C: 0xf09ab8, D: 0x857b73 },
    loop: 'ABABABAACCAABABADA',
    hop: 'C',
  },
  // 밍: a harp seal, bouncing and clapping her flippers.
  minami: {
    poses: {
      A: ['..........', '..BBBBBB..', '.BBBBBBBB.', '.BKBBBBKB.', '.BBBWWBBB.', 'BBBWKKWBBB', 'BBBBBBBBBB', '.BBBBBBBB.'],
      B: ['..BBBBBB..', '.BBBBBBBB.', '.BKBBBBKB.', '.BBBWWBBB.', 'BBBWKKWBBB', 'BBBBBBBBBB', '.BBBBBBBB.', '..BBBBBB..'],
      C: ['..........', '..BBBBBB..', 'BBBBBBBBBB', 'BBKBBBBKBB', '.BBBWWBBB.', '.BBWKKWBB.', '.BBBBBBBB.', '.BBBBBBBB.'],
      D: ['..........', '..BBBBBB..', '.BBBBBBBB.', '.BDBBBBDB.', '.BBBWWBBB.', 'BBBWKKWBBB', 'BBBBBBBBBB', '.BBBBBBBB.'],
    },
    colors: { B: 0x7cc7e8, K: 0x1b3a4a, W: 0xffffff, D: 0x5aa3c4 },
    light: { B: 0x3f9fc8, D: 0x2b7fa3 },
    loop: 'AABBAABBACACACAD',
    hop: 'B',
  },
  // 얌: an elephant, ears flapping, trunk swinging after a scent.
  may: {
    poses: {
      A: ['YY.YYYY.YY', 'YYYYYYYYYY', 'YYYKYYKYYY', 'YY.YYYY.YY', '...YYYY...', '..WYYYYW..', '....YY....', '....YYY...'],
      B: ['...YYYY...', '.YYYYYYYY.', 'YYYKYYKYYY', 'YYYYYYYYYY', 'YY.YYYY.YY', '..WYYYYW..', '....YY....', '...YYY....'],
      C: ['YY.YYYY.YY', 'YYYYYYYYYY', 'YYYKYYKYYY', 'YY.YYYY.YY', '...YYYY...', '..WYYYYW..', '....YY..Y.', '....YYYYY.'],
      D: ['YY.YYYY.YY', 'YYYYYYYYYY', 'YYYDYYDYYY', 'YY.YYYY.YY', '...YYYY...', '..WYYYYW..', '....YY....', '....YYY...'],
    },
    colors: { Y: 0xecd25b, K: 0x4a3b00, W: 0xffffff, D: 0xb89e2c },
    light: { Y: 0xd4a800, W: 0x9c8a5a, D: 0x8a6d00 },
    loop: 'AABBAABBACCAACCADA',
    hop: 'B',
  },
  // 쩨로밍: a squirrel, tail swishing, hopping off to look.
  zena: {
    poses: {
      A: ['......TTT.', '.P..P.TTTT', '.PPPP..TTT', '.KPKP..TTT', '.PPNP.TTT.', '.PPPPPTT..', '..PWWPT...', '..P..P....'],
      B: ['.P..P..TT.', '.PPPP.TTTT', '.KPKP.TTTT', '.PPNP..TTT', '.PPPPP.TT.', '..PWWPTT..', '..P..PT...', '..........'],
      C: ['.....TTT..', '.P..PTTTT.', '.PPPP.TTT.', '.KPKP..TTT', '.PPNP..TT.', '.PPPPPTT..', '..PWWPT...', '..P..P....'],
      D: ['......TTT.', '.P..P.TTTT', '.PPPP..TTT', '.DPDP..TTT', '.PPNP.TTT.', '.PPPPPTT..', '..PWWPT...', '..P..P....'],
    },
    colors: { P: 0xf4a6c8, T: 0xba92db, K: 0x3a2030, N: 0xd9588f, W: 0xffffff, D: 0xd98bb0 },
    light: { P: 0xe88ab4, T: 0x7a4bb0, W: 0xf4d7e4, D: 0xc76f9a },
    loop: 'ACACABBAACACABBAD',
    hop: 'B',
  },
}

export const ICON_COLUMNS = 10
export const ICON_ROWS = 4

const CLEAR = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584
const SPACE = 0x20
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const base64 = (bytes: Uint8Array): string => {
  let text = ''

  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at] ?? 0
    const b = bytes[at + 1] ?? 0
    const c = bytes[at + 2] ?? 0

    text += ALPHABET.charAt(a >> 2) + ALPHABET.charAt(((a & 3) << 4) | (b >> 4))
    text += at + 1 < bytes.length ? ALPHABET.charAt(((b & 15) << 2) | (c >> 6)) : '='
    text += at + 2 < bytes.length ? ALPHABET.charAt(c & 63) : '='
  }

  return text
}

/** A pose as a Raster's cells: the upper pixel a cell's ink, the lower its ground. */
const cellsOf = (rows: readonly string[], colors: Readonly<Record<string, number>>): string => {
  const words: number[] = []
  const pixel = (row: number, column: number): number => colors[rows[row]?.charAt(column) ?? '.'] ?? CLEAR

  for (let row = 0; row < ICON_ROWS; row += 1) {
    for (let column = 0; column < ICON_COLUMNS; column += 1) {
      const upper = pixel(row * 2, column)
      const lower = pixel(row * 2 + 1, column)

      if (upper === CLEAR && lower === CLEAR) words.push(SPACE, CLEAR, CLEAR)
      else if (upper === CLEAR) words.push(LOWER, lower, CLEAR)
      else words.push(UPPER, upper, lower)
    }
  }

  const bytes = new Uint8Array(words.length * 4)

  words.forEach((word, index) => new DataView(bytes.buffer).setUint32(index * 4, word, true))

  return base64(bytes)
}

type Reel = { still: string; loop: readonly string[]; cheer: readonly string[] }

const reelOf = ({ poses, colors, light, loop, hop }: Sprite, isLight: boolean): Reel => {
  const inks = isLight ? { ...colors, ...light } : colors
  const drawn = Object.fromEntries(Object.entries(poses).map(([name, rows]) => [name, cellsOf(rows, inks)]))
  const still = drawn.A ?? ''
  const frame = (name: string): string => drawn[name] ?? still

  return { still, loop: [...loop].map(frame), cheer: [frame(hop), still] }
}

const reelsOf = (isLight: boolean): Record<MemberId, Reel> => ({
  woni: reelOf(SPRITES.woni, isLight),
  liv: reelOf(SPRITES.liv, isLight),
  minami: reelOf(SPRITES.minami, isLight),
  may: reelOf(SPRITES.may, isLight),
  zena: reelOf(SPRITES.zena, isLight),
})

const REELS = { dark: reelsOf(false), light: reelsOf(true) }
const reel = (id: MemberId, isLight: boolean): Reel => (isLight ? REELS.light : REELS.dark)[id]

/** How long a pose stays up. */
export const FRAME_MS = 200

/** A member standing still, in the colors for the terminal's theme. */
export const iconOf = (id: MemberId, isLight = false): string => reel(id, isLight).still

/** Her pose on a beat while she works. */
export const frameOf = (id: MemberId, beat: number, isLight = false): string => {
  const { loop, still } = reel(id, isLight)

  return loop[beat % loop.length] ?? still
}

/** Her pose on a beat while she hops for a task that ended well. */
export const cheerOf = (id: MemberId, beat: number, isLight = false): string => reel(id, isLight).cheer[beat % 2] ?? reel(id, isLight).still

// The wordmark over the pane where there is room for it: RESCENE in a
// three-by-five pixel face, in the pink the fan wiki gives the group.
const FACE: Record<string, readonly string[]> = {
  R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  S: ['.XX', 'X..', '.X.', '..X', 'XX.'],
  C: ['.XX', 'X..', 'X..', 'X..', '.XX'],
  N: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'],
}

const wordmark = (word: string, ink: number): { columns: number; rows: number; cells: string } => {
  const lines = Array.from({ length: 6 }, (_, row) => [...word].map(letter => FACE[letter]?.[row] ?? '...').join('.'))
  const columns = lines[0]?.length ?? 0
  const words: number[] = []

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const upper = lines[row * 2]?.charAt(column) === 'X'
      const lower = lines[row * 2 + 1]?.charAt(column) === 'X'

      if (upper && lower) words.push(0x2588, ink, CLEAR)
      else if (upper) words.push(UPPER, ink, CLEAR)
      else if (lower) words.push(LOWER, ink, CLEAR)
      else words.push(SPACE, CLEAR, CLEAR)
    }
  }

  const bytes = new Uint8Array(words.length * 4)

  words.forEach((word, index) => new DataView(bytes.buffer).setUint32(index * 4, word, true))

  return { columns, rows: 3, cells: base64(bytes) }
}

const LOGOS = { dark: wordmark('RESCENE', 0xfc6fcf), light: wordmark('RESCENE', 0xc2188f) }

/** The wordmark's size, and its cells in the pink for the terminal's theme. */
export const LOGO = { columns: LOGOS.dark.columns, rows: LOGOS.dark.rows }
export const logoOf = (isLight = false): string => (isLight ? LOGOS.light : LOGOS.dark).cells
