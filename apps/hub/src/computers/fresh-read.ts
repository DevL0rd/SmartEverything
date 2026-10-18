import { SAMPLE_TOPICS, type ProcessWindow } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { deviceTarget, type Viewers } from '../metrics/viewers';

const KEY_FRAME_WAIT_MS = 3_000;

const READ_TOPICS = SAMPLE_TOPICS.filter((topic) => topic !== 'processes');

export type FreshViewers = Pick<Viewers<ProcessWindow>, 'hold' | 'release' | 'demand'>;

export class FreshRead {
  private readonly waiters = new Set<() => void>();

  constructor(private readonly viewers: FreshViewers) {}

  keyFrame(): void {
    const waiting = [...this.waiters];
    this.waiters.clear();
    waiting.forEach((arrived) => {
      arrived();
    });
  }

  async sample(deviceId: string): Promise<void> {
    const target = deviceTarget(deviceId);
    const demanded = this.viewers.demand(target).topics;
    if (READ_TOPICS.every((topic) => demanded.has(topic))) return;
    const holder = `fresh-read:${randomUUID()}`;
    const arrived = this.nextKeyFrame();
    this.viewers.hold(
      holder,
      READ_TOPICS.map((topic) => ({ target, topic })),
    );
    try {
      await arrived;
    } finally {
      this.viewers.release(holder);
    }
  }

  private nextKeyFrame(): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        this.waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, KEY_FRAME_WAIT_MS);
      this.waiters.add(done);
    });
  }
}
