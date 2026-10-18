import { background } from '@smarteverything/logging';

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
  readonly failures: number;
}

export class Utterances {
  private pending: Utterance[] = [];
  private running = 0;
  private failures = 0;
  private closed = false;

  constructor(private readonly deps: UtterancesDeps) {}

  enqueue(utterance: Utterance): void {
    if (this.closed) {
      return;
    }
    this.pending.push(utterance);
    this.drain();
  }

  counts(): UtteranceCounts {
    return { pending: this.pending.length, failures: this.failures };
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
      background(this.work(next), 'utterances.work_failed');
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
