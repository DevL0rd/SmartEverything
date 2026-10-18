import { background } from '@smarteverything/logging';
import type { SessionAgent } from '../session-agent/session-agent';

export interface RingSound {
  readonly volume: number;
  readonly muted: boolean;
}

export interface RingVolume {
  readonly current: () => Promise<RingSound>;
  readonly raise: () => Promise<void>;
  readonly restore: (sound: RingSound) => Promise<void>;
}

export class MachineRing {
  private saved: RingSound | null = null;

  constructor(
    private readonly agent: Pick<SessionAgent, 'ring'>,
    private readonly sound: RingVolume,
  ) {}

  async set(on: boolean): Promise<void> {
    if (on) {
      await this.start();
      return;
    }
    await this.agent.ring(false, () => undefined);
    await this.restore();
  }

  private async start(): Promise<void> {
    this.saved ??= await this.sound.current();
    await this.sound.raise();
    try {
      await this.agent.ring(true, () => {
        background(this.restore(), 'node.ring_restore_failed');
      });
    } catch (cause) {
      await this.restore();
      throw cause;
    }
  }

  private async restore(): Promise<void> {
    const saved = this.saved;
    this.saved = null;
    if (saved === null) return;
    await this.sound.restore(saved);
  }
}
