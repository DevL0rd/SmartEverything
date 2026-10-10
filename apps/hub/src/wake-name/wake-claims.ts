import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';

export const WAKE_RANKS = { talk: 2, voice_call: 2, camera: 1 } as const;

export type WakeSource = keyof typeof WAKE_RANKS;

export const CLAIM_WINDOW_MS = 8000;
export const STAND_DOWN_GRACE_MS = 1500;

export interface WakeClaim {
  readonly source: WakeSource;
  readonly key: string;
}

export interface WakeClaimsOptions {
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Held {
  readonly key: string;
  readonly until: number;
}

export class WakeClaims {
  private readonly held = new Map<string, Held>();

  constructor(private readonly options: WakeClaimsOptions) {}

  request(claim: WakeClaim): Promise<boolean> {
    if (!this.outranked(claim.source)) {
      return Promise.resolve(this.decide(claim));
    }
    return new Promise((resolve) => {
      const due = new Date(this.now() + STAND_DOWN_GRACE_MS);
      this.options.clock.at(due, () => {
        resolve(this.decide(claim));
      });
    });
  }

  private decide(claim: WakeClaim): boolean {
    const rival = this.rival(claim.source);
    if (rival !== null) {
      this.options.log.info('wake.stood_down', {
        source: claim.source,
        key: claim.key,
        to: rival,
      });
      return false;
    }
    this.held.set(claim.source, { key: claim.key, until: this.now() + CLAIM_WINDOW_MS });
    return true;
  }

  private outranked(source: WakeSource): boolean {
    return Object.values(WAKE_RANKS).some((rank) => rank > WAKE_RANKS[source]);
  }

  private rival(source: WakeSource): string | null {
    const now = this.now();
    const rival = Object.entries(WAKE_RANKS).find(
      ([other, rank]) => rank > WAKE_RANKS[source] && (this.held.get(other)?.until ?? 0) > now,
    );
    return rival === undefined ? null : rival[0];
  }

  private now(): number {
    return this.options.clock.now().getTime();
  }
}
