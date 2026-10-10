import type { MediaSize } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Go2rtcClient } from './go2rtc-client';

const FRAME_FRESH_MS = 5000;
const FRAME_TIMEOUT_MS = 10_000;
const FRAMES_AT_ONCE = 2;

export class FrameTimeoutError extends Error {
  override readonly name = 'FrameTimeoutError';

  constructor(deviceId: string) {
    super(
      `The camera ${deviceId} sent no picture within ${String(FRAME_TIMEOUT_MS / 1000)} s, so the snapshot was given up.`,
    );
  }
}

interface Cached {
  readonly at: number;
  readonly frame: Uint8Array;
}

export interface FrameCacheOptions {
  readonly client: Pick<Go2rtcClient, 'frame'>;
  readonly now: () => number;
  readonly log: Logger;
}

export class FrameCache {
  private readonly cached = new Map<string, Cached>();
  private readonly pending = new Map<string, Promise<Uint8Array>>();
  private readonly waiting: (() => void)[] = [];
  private running = 0;

  constructor(private readonly options: FrameCacheOptions) {}

  frame(deviceId: string, size: MediaSize): Promise<Uint8Array> {
    const key = `${deviceId}/${size}`;
    const cached = this.cached.get(key);
    if (cached !== undefined && this.options.now() - cached.at < FRAME_FRESH_MS) {
      return Promise.resolve(cached.frame);
    }
    const pending = this.pending.get(key);
    if (pending !== undefined) {
      return pending;
    }
    const fetched = this.fetch(deviceId, size).then((frame) => {
      this.cached.set(key, { at: this.options.now(), frame });
      return frame;
    });
    const settled = fetched.finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, settled);
    return settled;
  }

  invalidate(deviceId: string): void {
    for (const key of [...this.cached.keys()]) {
      if (key.startsWith(`${deviceId}/`)) {
        this.cached.delete(key);
      }
    }
  }

  private async fetch(deviceId: string, size: MediaSize): Promise<Uint8Array> {
    await this.slot();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new FrameTimeoutError(deviceId));
    }, FRAME_TIMEOUT_MS);
    try {
      return await this.options.client.frame(deviceId, size, controller.signal);
    } catch (cause) {
      if (controller.signal.aborted) {
        this.options.log.warn('snapshot.timed_out', { deviceId, size });
        throw new FrameTimeoutError(deviceId);
      }
      throw cause;
    } finally {
      clearTimeout(timer);
      this.release();
    }
  }

  private slot(): Promise<void> {
    if (this.running < FRAMES_AT_ONCE) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.running += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.running -= 1;
    this.waiting.shift()?.();
  }
}
