export type MemberId = 'woni' | 'liv' | 'minami' | 'may' | 'zena'
export type Role = '지휘' | '구현' | '검토' | '조사' | '탐색'
/** Which member each kind of work is first given to: the person sets it, and it is kept between sessions. */
export type Cast = { '구현': MemberId; '검토': MemberId; '조사': MemberId; '탐색': MemberId }
export type TaskStatus = 'running' | 'waiting' | 'done' | 'failed'

/** What a piece of work cost: tokens read fresh, read from cache, written. */
export type Tokens = {
  fresh: number
  cached: number
  out: number
  /** Dollars, where the engine that did the work states them. */
  usd?: number
}

export type Task = {
  /** An agent's id, `spawn:<tool_use_id>` until it is known, or `orca:<id>`. */
  id: string
  kind: 'agent' | 'orca'
  member: MemberId
  role: Role
  /** The subagent type, or the fleet-run profile. */
  engine: string
  title: string
  status: TaskStatus
  startedAt: number
  endedAt?: number
  tool?: string
  /** What the tool is on: a file's name, a command's start. */
  detail?: string
  /** The first line of what she handed back, once she has. */
  report?: string
  /** Tool calls in each of the last stretches of time, oldest first: how busy she has been. */
  pulse?: number[]
  /** Which stretch since the task began the last of `pulse` is. */
  pulseAt?: number
  /** What she was asked to do, in a line: the brief's first. */
  brief?: string
  /** What she did, call by call, newest last. */
  trail?: Step[]
  /** What she handed back, its first lines. */
  summary?: string[]
  /** An Orca worker's output as it runs, where the launch could be made to keep it. */
  live?: string
  /** The Orca terminal a worker was launched in, by its handle: its screen can be read while it runs. */
  term?: string
  /** When the meta file its result path already held was written: the worker's own is newer. */
  metaAt?: number
  /** Ended by guess, nobody having reported it: a report that comes later overrules this. */
  isGuessed?: boolean
  toolCount: number
  /** A line the member really said, as the fan wiki records it. */
  quote: string
  /** What the line is about, in plain words. */
  note: string
  isSlow?: boolean
  /** An Orca worker's result file, once known. */
  out?: string
  /** The tool call that started it: an Agent call's id, or a Bash call's. */
  call?: string
  tokens?: Tokens
}

/** What a member is doing in the main session right now: its own tool calls, by the kind of work they are. */
export type Live = {
  /** The call in plain words: `고치는 중: view.tsx`. */
  phrase: string
  /** When the last call started. */
  at: number
  /** Calls of hers still running. */
  running: number
  /** Those calls, oldest first, each with what it is doing. */
  open?: { id: string; phrase: string }[]
  /** Calls of hers this turn. */
  count: number
  /** The call that ended last was refused or failed. */
  isFailed?: boolean
}

/** One thing a member did, in plain words, and when. */
export type Step = {
  at: number
  text: string
  /** The tool call it is of, while how that went can still change what it says. */
  call?: string
}

/** An Orca worker's own words, read off its files: the task they are of, and the lines. */
export type Peek = {
  id: string
  lines: string[]
  /** The lines are from before: the screen could not be read since. */
  isStale?: boolean
}

/** The main session's turn under way: when it began, what was asked, and of whom where the person named her. */
export type Turn = { startedAt: number; ask: string; to?: MemberId }

/** A line and how often it has been said. */
export type Line = { member: MemberId; quote: string; count: number }

export type Said = { member: MemberId; quote: string; note: string; at: number }

export type Limit = {
  /** `five_hour`, `seven_day`, or a gateway's `spend_limit`. */
  kind: string
  percentUsed: number
  /** When the window resets, in the clock's milliseconds. */
  resetsAt?: number
}

/** The session's own figures, as the status line has them. */
export type Usage = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limits: Limit[]
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    rescene: {
      isOn: boolean
      tasks: Task[]
      now: number
      waveAt: number
      leader: Said | null
      ticker: Said | null
      isPaneOpen: boolean
      /** The person closed the pane by hand: it stays closed until they ask for it. */
      isPaneDismissed: boolean
      /** The lines said so far, newest last. */
      feed: Said[]
      /** The one-time lines already said, by the moment they are for; a moment is said again once it has passed. */
      moments: string[]
      /** The 명대사 월드컵: how often each line has been said this session, the most said first. */
      cup: Line[]
      turn: Turn | null
      live: { woni?: Live; liv?: Live; minami?: Live; may?: Live; zena?: Live }
      /** What each member did in the main session, beside 원이, newest last; kept from turn to turn. */
      steps: { woni?: Step[]; liv?: Step[]; minami?: Step[]; may?: Step[]; zena?: Step[] }
      /** Whose backstage the pane shows instead of the five cards. */
      focus: MemberId | null
      /** The Orca worker's lines the backstage shows. */
      peek: Peek | null
      /** Whom the person's next prompts go to; nobody named, 원이 hands the work out. */
      target: MemberId | null
      /** The terminal's theme is a light one: the members' colors are drawn deeper. */
      isLight: boolean
      /** The language in use, once the session has settled it. */
      lang: 'ko' | 'en' | null
      /** Who has which kind of work. */
      cast: Cast
      /** The pane shows the screen the roles are set on. */
      isCasting: boolean
      /** The roles changed since the main loop was last told who has which. */
      isRecast: boolean
      /** What tasks no longer listed cost, by member: cleared or trimmed history still counts. */
      banked: { woni?: Tokens; liv?: Tokens; minami?: Tokens; may?: Tokens; zena?: Tokens }
      usage: Usage | null
      leaderTokens: Tokens
      /** Whether the main loop was told, beside a prompt, that it conducts as 원이; `undo` once it must be told to stop. */
      briefed: 'no' | 'yes' | 'undo'
    }
  }
}
