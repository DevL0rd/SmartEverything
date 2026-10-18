import type { RecordedTurn } from './call-record';
import type { LiveSession, Picture } from './gemini';
import type { ToolAnswer } from './tool-answer';

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
  readonly answer: boolean;
  readonly pictures: readonly Picture[];
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
    this.entries.push({ line: `${SPEAKER[turn.who]}: ${turn.text}`, answer: false, pictures: [] });
  }

  delivered(name: string, answer: ToolAnswer): void {
    this.entries.push({
      line: `${name} returned ${JSON.stringify(answer.response)}`,
      answer: true,
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

  plan(reason: RenewReason): RenewPlan | null {
    if (reason === 'stalled') {
      return { resume: null };
    }
    if (!this.proven || reason === 'silent') {
      return this.resumed ? { resume: null } : null;
    }
    return { resume: this.handle };
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
    const lines = this.entries
      .filter((entry, index) => index >= this.saved || (!resumed && !entry.answer))
      .map((entry) => entry.line);
    if (lines.length === 0) {
      return null;
    }
    return {
      text: [RENEWED, ...lines].join('\n'),
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
