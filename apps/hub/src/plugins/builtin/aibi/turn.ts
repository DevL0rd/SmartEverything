import type { Params } from './catalogue';
import type { SpeechKind, SpeechStream, Speeches } from './speech-stream';

export const TURN_TIMEOUT_MS = 15_000;
const TRANSCRIPT_WAIT_MS = 250;

interface SpokenOutcome {
  readonly kind: 'speech';
  readonly stream: SpeechStream;
  readonly text: string;
}

export type Outcome = (
  | SpokenOutcome
  | { readonly kind: 'action'; readonly behavior: string; readonly params: Params }
  | { readonly kind: 'look' }
  | { readonly kind: 'connect'; readonly answer: SpokenOutcome }
  | { readonly kind: 'farewell'; readonly answer: SpokenOutcome }
  | { readonly kind: 'unheard' }
  | { readonly kind: 'quit' }
  | { readonly kind: 'pause' }
) & { readonly heard?: string };

export type BodyOutcome = Extract<Outcome, { readonly kind: 'action' | 'look' }>;

function wordy(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export class Turn {
  readonly outcome: Promise<Outcome>;
  said = '';
  listened = false;
  private heardText = '';
  private ending = false;
  private answerFollows = false;
  private keepOpen = false;
  private resolve: (outcome: Outcome) => void = () => undefined;
  private stream: SpeechStream | null = null;
  private decided = false;
  private spokenAloud = false;
  private waiting: NodeJS.Timeout | null = null;
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly speeches: Speeches,
    private readonly kind: SpeechKind,
    timeoutMs: number,
    private readonly onTimeout: () => void,
  ) {
    this.outcome = new Promise((resolve) => {
      this.resolve = resolve;
    });
    this.timer = setTimeout(() => {
      this.onTimeout();
      this.decide({ kind: 'pause' });
    }, timeoutMs);
    this.timer.unref();
  }

  get held(): SpeechStream | null {
    return this.keepOpen && this.stream?.open === true ? this.stream : null;
  }

  get spoken(): boolean {
    if (this.stream === null) {
      return false;
    }
    return this.decided ? this.spokenAloud : this.said.trim() === '' || wordy(this.said);
  }

  get speaking(): boolean {
    return this.stream !== null;
  }

  get heard(): string {
    return this.heardText;
  }

  hear(fragment: string): void {
    this.heardText += fragment;
  }

  markEnding(): void {
    this.ending = true;
  }

  expectAnswer(): void {
    if (!this.speaking) {
      this.answerFollows = true;
    }
  }

  skipAcknowledgement(): boolean {
    if (this.answerFollows && !this.speaking) {
      this.answerFollows = false;
      return true;
    }
    return false;
  }

  keepStreamOpen(): void {
    this.keepOpen = true;
  }

  audio(pcm: Int16Array): void {
    if (this.stream === null) {
      if (this.decided) {
        return;
      }
      this.stream = this.speeches.create(this.kind);
      this.waiting = setTimeout(
        () => {
          this.speak();
        },
        this.said === '' ? TRANSCRIPT_WAIT_MS : 0,
      );
    }
    this.stream.write(pcm);
  }

  text(fragment: string): void {
    this.said += fragment;
    if (this.waiting !== null && wordy(this.said)) {
      this.speak();
    }
  }

  act(outcome: BodyOutcome): boolean {
    if (this.stream !== null || this.decided) {
      return false;
    }
    this.decide(outcome);
    return true;
  }

  complete(): void {
    if (this.stream !== null && !this.decided) {
      this.settle(this.stream);
    }
    if (!this.keepOpen) {
      this.stream?.end();
    }
    if (!this.decided) {
      this.decide({ kind: this.ending ? 'quit' : 'pause' });
    }
  }

  abort(): void {
    this.stream?.fail();
    if (!this.decided) {
      this.decide({ kind: 'quit' });
    }
  }

  private settle(stream: SpeechStream): void {
    if (this.said.trim() !== '' && !wordy(this.said)) {
      stream.fail();
    } else {
      this.speak();
    }
  }

  private speak(): void {
    if (this.waiting !== null) {
      clearTimeout(this.waiting);
      this.waiting = null;
    }
    if (this.decided || this.stream === null || (this.said.trim() !== '' && !wordy(this.said))) {
      return;
    }
    this.decide({ kind: 'speech', stream: this.stream, text: clean(this.said) });
  }

  private decide(outcome: Outcome): void {
    if (this.decided) {
      return;
    }
    this.decided = true;
    this.spokenAloud = outcome.kind === 'speech';
    clearTimeout(this.timer);
    this.resolve({ ...outcome, heard: clean(this.heardText) });
  }
}
