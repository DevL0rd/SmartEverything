import { Preroll } from '@smarteverything/domain';
import { concat } from '../assistant-voice/audio';

export const REPLAY_MS = 3000;
export const HANDOFF_LIMIT_MS = 15_000;
const SAMPLES_PER_MS = 16;

export class WakeHandoff {
  private readonly recent = new Preroll<Int16Array>(REPLAY_MS);
  private held: Int16Array[] | null = null;
  private heldMs = 0;

  keep(pcm: Int16Array): void {
    const ms = pcm.length / SAMPLES_PER_MS;
    if (this.held === null) {
      this.recent.push(pcm, ms);
      return;
    }
    this.held.push(pcm);
    this.heldMs += ms;
    if (this.heldMs > HANDOFF_LIMIT_MS) {
      this.held = null;
    }
  }

  begin(): () => Int16Array {
    const held = this.recent.take();
    this.held = held;
    this.heldMs = 0;
    return (): Int16Array => {
      const words = this.held === held ? concat(held) : new Int16Array(0);
      if (this.held === held) {
        this.held = null;
      }
      return words;
    };
  }
}
