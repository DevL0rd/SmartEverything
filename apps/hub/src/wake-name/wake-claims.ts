import type { WakeArbitrated, WakeClaimSource, WakeDecider } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';

export const CONTEST_MS = 1000;
export const HOLD_MS = 3000;

export type WakeSource = WakeClaimSource;

export interface WakeClaimant {
  readonly source: WakeSource;
  readonly key: string;
}

export interface WakeClaim extends WakeClaimant {
  readonly snippetDbfs: number;
}

export type Superseded = (winner: WakeClaim) => void;

export interface WakeGrant {
  readonly granted: boolean;
  readonly onSuperseded: (stop: Superseded) => void;
}

export type OnSuperseded = WakeGrant['onSuperseded'];

export interface WakeClaimsOptions {
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

const TIER_DISCORD = 3;
const TIER_WALKIE = 2;
const TIER_COMPUTER = 1;

function tier(source: WakeSource): number {
  switch (source) {
    case 'voice_call':
      return TIER_DISCORD;
    case 'talk':
      return TIER_WALKIE;
    case 'computer':
      return TIER_COMPUTER;
    case 'camera':
    case 'phone':
      return 0;
  }
}

interface Entry {
  readonly claim: WakeClaim;
  readonly afterMs: number;
  outcome: WakeArbitrated['claims'][number]['outcome'];
}

class Contest {
  readonly entries: Entry[];
  private stop: Superseded | null = null;
  private holding: Entry;

  constructor(
    readonly startedAt: number,
    private current: WakeClaim,
  ) {
    this.holding = { claim: current, afterMs: 0, outcome: 'won' };
    this.entries = [this.holding];
  }

  get holder(): WakeClaim {
    return this.current;
  }

  refuse(claim: WakeClaim, afterMs: number): void {
    this.entries.push({ claim, afterMs, outcome: 'stood_down' });
  }

  takeOver(claim: WakeClaim, afterMs: number): WakeGrant {
    const loser = this.stop;
    this.holding.outcome = 'superseded';
    this.holding = { claim, afterMs, outcome: 'won' };
    this.entries.push(this.holding);
    this.current = claim;
    this.stop = null;
    loser?.(claim);
    return this.grant();
  }

  grant(): WakeGrant {
    const holder = this.current;
    return {
      granted: true,
      onSuperseded: (stop): void => {
        if (this.current === holder) {
          this.stop = stop;
        } else {
          stop(this.current);
        }
      },
    };
  }

  decidedBy(): WakeDecider {
    const heard = new Set(this.entries.map(({ claim }) => `${claim.source}:${claim.key}`));
    if (heard.size === 1) {
      return 'only';
    }
    const winning = tier(this.current.source);
    if (!this.entries.some((entry) => tier(entry.claim.source) < winning)) {
      return 'loudest';
    }
    switch (winning) {
      case TIER_DISCORD:
        return 'discord';
      case TIER_WALKIE:
        return 'walkie';
      default:
        return 'computer';
    }
  }
}

function windowOf(claim: WakeClaim, holder: WakeClaim): number {
  const lateTier = claim.source === 'voice_call' || claim.source === 'computer';
  return lateTier && tier(claim.source) > tier(holder.source) ? HOLD_MS : CONTEST_MS;
}

function beats(claim: WakeClaim, holder: WakeClaim): boolean {
  if (claim.source === holder.source && claim.key === holder.key) {
    return false;
  }
  const gap = tier(claim.source) - tier(holder.source);
  return gap === 0 ? claim.snippetDbfs > holder.snippetDbfs : gap > 0;
}

export class WakeClaims {
  private contest: Contest | null = null;
  private readonly listeners = new Set<(arbitrated: WakeArbitrated) => void>();

  constructor(private readonly options: WakeClaimsOptions) {}

  onArbitrated(listener: (arbitrated: WakeArbitrated) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  request(claim: WakeClaim): WakeGrant {
    const now = this.now();
    const contest = this.contest;
    if (contest === null || now - contest.startedAt >= HOLD_MS) {
      return this.open(claim, now);
    }
    const afterMs = now - contest.startedAt;
    if (afterMs < windowOf(claim, contest.holder) && beats(claim, contest.holder)) {
      return contest.takeOver(claim, afterMs);
    }
    contest.refuse(claim, afterMs);
    this.options.log.info('wake.stood_down', {
      source: claim.source,
      key: claim.key,
      to: contest.holder.key,
    });
    return { granted: false, onSuperseded: (): void => undefined };
  }

  private open(claim: WakeClaim, now: number): WakeGrant {
    const contest = new Contest(now, claim);
    this.contest = contest;
    this.options.clock.at(new Date(now + HOLD_MS), () => {
      this.settle(contest);
    });
    return contest.grant();
  }

  private settle(contest: Contest): void {
    const arbitrated: WakeArbitrated = {
      at: new Date(contest.startedAt).toISOString(),
      winner: contest.holder,
      decidedBy: contest.decidedBy(),
      claims: contest.entries.map(({ claim, afterMs, outcome }) => ({
        ...claim,
        afterMs,
        outcome,
      })),
    };
    this.options.log.info('wake.arbitrated', {
      winner: arbitrated.winner.key,
      decidedBy: arbitrated.decidedBy,
      claims: arbitrated.claims.map((one) => ({
        ...one,
        snippetDbfs: Math.round(one.snippetDbfs * 10) / 10,
      })),
    });
    this.listeners.forEach((listener) => {
      listener(arbitrated);
    });
  }

  private now(): number {
    return this.options.clock.now().getTime();
  }
}
