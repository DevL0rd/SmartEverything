import type { LiveOptions, VoiceProvider } from './gemini';
import { SessionHolder } from './session-holder';
import { plainLine, type VoiceLine } from './voice-line';
import { shortHash } from './warm-policy';

export interface WarmKey {
  readonly profileId: string;
  readonly chatId: string;
  readonly kind: string;
}

export class WarmSessions {
  private readonly holders = new Map<string, SessionHolder>();
  private stopped = false;

  constructor(
    private readonly provider: VoiceProvider,
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
  ) {}

  line(key: WarmKey, callId: string, base: () => LiveOptions, enabled = true): VoiceLine {
    if (!enabled) {
      this.release((holder) => !holder.leased, 'switched_off');
    }
    const lease = this.stopped || !enabled ? null : this.holderOf(key).lease(callId, base);
    return lease ?? plainLine(this.provider);
  }

  stop(): void {
    this.stopped = true;
    this.release(() => true, 'hub_stopping');
  }

  private release(which: (holder: SessionHolder) => boolean, reason: string): void {
    for (const [id, holder] of this.holders) {
      if (which(holder)) {
        holder.stop(reason);
        this.holders.delete(id);
      }
    }
  }

  private holderOf(key: WarmKey): SessionHolder {
    const id = JSON.stringify([key.profileId, key.chatId, key.kind]);
    const existing = this.holders.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const holder = new SessionHolder({
      provider: this.provider,
      key: shortHash(id),
      now: this.now,
      random: this.random,
    });
    this.holders.set(id, holder);
    return holder;
  }
}
