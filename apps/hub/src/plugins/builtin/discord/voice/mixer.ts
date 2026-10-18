import { appendTo } from '@smarteverything/domain';
import { concat } from '../../../../assistant-voice/audio';

const TICK_MS = 100;
const TICK_SAMPLES = 1600;
const INT16_MIN = -32_768;
const INT16_MAX = 32_767;

export class Mixer {
  private readonly queues = new Map<string, Int16Array[]>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly send: (pcm: Int16Array) => void) {}

  start(): void {
    this.timer ??= setInterval(() => {
      this.tick();
    }, TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
    }
    this.timer = null;
    this.queues.clear();
  }

  hear(userId: string, pcm: Int16Array): void {
    appendTo(this.queues, userId, pcm);
  }

  private tick(): void {
    do {
      this.send(this.mix());
    } while (this.backlog());
  }

  private mix(): Int16Array {
    const mixed = new Int32Array(TICK_SAMPLES);
    for (const userId of this.queues.keys()) {
      this.take(userId).forEach((sample, index) => {
        mixed[index] = (mixed[index] ?? 0) + sample;
      });
    }
    return Int16Array.from(mixed, (sample) => Math.max(INT16_MIN, Math.min(INT16_MAX, sample)));
  }

  private take(userId: string): Int16Array {
    const joined = concat(this.queues.get(userId) ?? []);
    this.queues.set(userId, joined.length > TICK_SAMPLES ? [joined.slice(TICK_SAMPLES)] : []);
    return joined.subarray(0, TICK_SAMPLES);
  }

  private backlog(): boolean {
    return [...this.queues.values()].some(
      (queue) => queue.reduce((total, chunk) => total + chunk.length, 0) >= TICK_SAMPLES,
    );
  }
}
