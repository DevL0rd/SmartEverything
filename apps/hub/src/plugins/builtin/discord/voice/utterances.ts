import { loudness, SPEECH_RATE } from './pcm';

const MIN_SECONDS = 0.4;
const QUIET_LEVEL = 120;
const MAX_PENDING = 16;
const WORKERS = 2;

export interface Utterance {
  readonly userId: string;
  readonly startedAt: number;
  readonly pcm: Int16Array;
}

export interface UtterancesDeps {
  readonly transcribe: (utterance: Utterance) => Promise<void>;
  readonly failed: (cause: unknown) => void;
}

export interface UtteranceCounts {
  readonly pending: number;
  readonly dropped: number;
  readonly failures: number;
}

export class Utterances {
  private pending: Utterance[] = [];
  private running = 0;
  private dropped = 0;
  private failures = 0;
  private closed = false;

  constructor(private readonly deps: UtterancesDeps) {}

  enqueue(utterance: Utterance): void {
    if (this.closed || utterance.pcm.length < MIN_SECONDS * SPEECH_RATE) {
      return;
    }
    if (loudness(utterance.pcm) < QUIET_LEVEL) {
      return;
    }
    if (this.pending.length >= MAX_PENDING) {
      this.pending.shift();
      this.dropped += 1;
    }
    this.pending.push(utterance);
    this.drain();
  }

  counts(): UtteranceCounts {
    return { pending: this.pending.length, dropped: this.dropped, failures: this.failures };
  }

  close(): void {
    this.closed = true;
    this.pending = [];
  }

  private drain(): void {
    while (this.running < WORKERS) {
      const next = this.pending.shift();
      if (next === undefined) {
        return;
      }
      this.running += 1;
      void this.work(next);
    }
  }

  private async work(utterance: Utterance): Promise<void> {
    try {
      await this.deps.transcribe(utterance);
    } catch (cause) {
      this.failures += 1;
      this.deps.failed(cause);
    } finally {
      this.running -= 1;
      this.drain();
    }
  }
}
