import { Logger } from '@smarteverything/logging';
import type { RecordedTurn } from './call-record';
import type { LiveSession, LiveWindow, Picture } from './gemini';
import { catchUpCharacters } from './live-window';
import type { ToolAnswer } from './tool-answer';

const log = new Logger('hub.voice-renewal');

export type RenewReason = 'tuning' | 'go_away' | 'dropped' | 'silent' | 'stalled';

export interface RenewPlan {
  readonly resume: string | null;
}

export interface CatchUp {
  readonly text: string;
  readonly lines: number;
  readonly pictures: readonly Picture[];
}

export interface RenewalAnswer {
  readonly reason: RenewReason;
  readonly resumed: boolean;
  readonly sinceRenewMs: number;
}

interface Entry {
  readonly line: string;
  readonly tool: string | null;
  readonly pictures: readonly Picture[];
}

interface Chosen {
  readonly lines: string[];
  readonly left: number;
  readonly leftChars: number;
  readonly tooLarge: number;
}

const BROKEN_SESSION_CODES: ReadonlySet<number> = new Set([1007, 1008, 1011]);

function tooLargeLine(tool: string): string {
  return `${tool} returned a result too large to repeat here; call it again if you need it.`;
}

function leftOutLine(left: number): string {
  return `[${String(left)} earlier ${left === 1 ? 'line' : 'lines'} of this call do not fit in your memory and are left out; ask them if you need something from before.]`;
}

function chosen(entries: readonly Entry[], budget: number): Chosen {
  const lines: string[] = [];
  let used = 0;
  let tooLarge = 0;
  let index = entries.length - 1;
  for (; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined) break;
    const line =
      entry.tool !== null && entry.line.length > budget ? tooLargeLine(entry.tool) : entry.line;
    if (used + line.length > budget) break;
    if (line !== entry.line) tooLarge += 1;
    used += line.length;
    lines.unshift(line);
  }
  const left = entries.slice(0, index + 1);
  return {
    lines,
    left: left.length,
    leftChars: left.reduce((sum, entry) => sum + entry.line.length, 0),
    tooLarge,
  };
}

const SPEAKER: Readonly<Record<RecordedTurn['who'], string>> = {
  person: 'They said',
  assistant: 'You said',
  tool: 'Tool',
};

const RENEWED =
  '[Your connection was renewed, so the latest part of this call may be missing from your memory. This is what happened, oldest first:]';
export const CARRY_ON_ANSWER =
  '[Carry on from here and answer them now. Do not mention the connection.]';
export const CARRY_ON_WAIT =
  '[Carry on from here. Do not mention the connection; wait for them to speak.]';

export class LiveRenewal {
  private handle: string | null = null;
  private current = false;
  private proven = false;
  private resumed = false;
  private renewed: { readonly reason: RenewReason; readonly at: number } | null = null;
  private wanted: RenewReason | null = null;
  private entries: Entry[] = [];
  private saved = 0;

  constructor(private readonly window: () => LiveWindow | null) {}

  get unanswered(): boolean {
    return this.renewed !== null;
  }

  get state(): { readonly handle: boolean; readonly current: boolean } {
    return { handle: this.handle !== null, current: this.current };
  }

  get resumedLast(): boolean {
    return this.resumed;
  }

  resumable(handle: string | null): void {
    this.proven = true;
    if (handle === null) {
      this.current = false;
      return;
    }
    this.handle = handle;
    this.current = true;
    this.saved = this.entries.length;
    this.entries = this.entries.map((entry) => ({ ...entry, pictures: [] }));
  }

  served(): void {
    this.proven = true;
    this.current = false;
  }

  sent(): void {
    this.current = false;
  }

  recorded(turn: RecordedTurn): void {
    this.entries.push({ line: `${SPEAKER[turn.who]}: ${turn.text}`, tool: null, pictures: [] });
  }

  delivered(name: string, answer: ToolAnswer): void {
    this.entries.push({
      line: `${name} returned ${JSON.stringify(answer.response)}`,
      tool: name,
      pictures: answer.pictures,
    });
  }

  want(reason: RenewReason): void {
    this.wanted ??= reason;
  }

  due(retuned: boolean): RenewReason | null {
    const reason = this.wanted ?? (retuned ? 'tuning' : null);
    return this.current ? reason : null;
  }

  plan(reason: RenewReason, closeCode?: number): RenewPlan | null {
    if (reason === 'stalled') {
      return { resume: null };
    }
    if (!this.proven || reason === 'silent') {
      return this.resumed ? { resume: null } : null;
    }
    const broken = closeCode !== undefined && BROKEN_SESSION_CODES.has(closeCode);
    return { resume: broken ? null : this.handle };
  }

  forget(): void {
    this.handle = null;
    this.current = false;
  }

  opening(reason: RenewReason | null, resumed: boolean, at: number): void {
    this.proven = false;
    this.resumed = resumed;
    this.wanted = null;
    this.renewed = reason === null ? null : { reason, at };
  }

  catchUp(resumed: boolean): CatchUp | null {
    if (resumed && this.current) {
      return null;
    }
    const budget = catchUpCharacters(this.window());
    const { lines, left, leftChars, tooLarge } = chosen(
      this.entries.filter(
        (entry, index) => index >= this.saved || (!resumed && entry.tool === null),
      ),
      budget,
    );
    if (lines.length === 0) {
      return null;
    }
    if (left > 0 || tooLarge > 0) {
      log.warn('voice.catch_up_left_out', {
        left,
        leftChars,
        tooLarge,
        kept: lines.length,
        budgetChars: budget,
      });
    }
    return {
      text: [RENEWED, ...(left > 0 ? [leftOutLine(left)] : []), ...lines].join('\n'),
      lines: lines.length,
      pictures: this.entries.slice(this.saved).flatMap((entry) => entry.pictures),
    };
  }

  replied(now: number): RenewalAnswer | null {
    const renewed = this.renewed;
    this.renewed = null;
    return renewed === null
      ? null
      : { reason: renewed.reason, resumed: this.resumed, sinceRenewMs: now - renewed.at };
  }
}

export function trackedSession(session: LiveSession, renewal: LiveRenewal): LiveSession {
  return {
    ...session,
    speaking: (speaking): void => {
      renewal.sent();
      session.speaking(speaking);
    },
    text: (text, respond): void => {
      renewal.sent();
      session.text(text, respond);
    },
    picture: (picture): void => {
      renewal.sent();
      session.picture(picture);
    },
    toolResult: (...result): void => {
      renewal.sent();
      session.toolResult(...result);
    },
  };
}
