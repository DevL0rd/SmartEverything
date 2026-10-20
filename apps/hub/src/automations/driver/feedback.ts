import type { SignalInput } from '@smarteverything/domain';
import type { CauseLink } from './admission';

export const CHAIN_RETENTION_MS = 2 * 60_000;

interface Held {
  readonly chain: readonly CauseLink[];
  endedAt: number | null;
}

function link(trigger: SignalInput | null): CauseLink | null {
  const runId = trigger?.data['causeRunId'];
  const automationId = trigger?.data['causeAutomationId'];
  return typeof runId === 'string' && typeof automationId === 'string'
    ? { automationId, runId }
    : null;
}

export function ignoresOwnChange(
  automationId: string,
  ignoreOwnChanges: boolean,
  trigger: SignalInput | null,
): boolean {
  return ignoreOwnChanges && link(trigger)?.automationId === automationId;
}

export class FeedbackChains {
  private readonly runs = new Map<string, Held>();

  chainOf(trigger: SignalInput | null): readonly CauseLink[] {
    const cause = link(trigger);
    if (cause === null) return [];
    return [...(this.runs.get(cause.runId)?.chain ?? []), cause];
  }

  begin(runId: string, chain: readonly CauseLink[], now: number): void {
    this.prune(now);
    this.runs.set(runId, { chain, endedAt: null });
  }

  end(runId: string, now: number): void {
    const held = this.runs.get(runId);
    if (held !== undefined) held.endedAt = now;
  }

  private prune(now: number): void {
    for (const [runId, held] of this.runs) {
      if (held.endedAt !== null && now - held.endedAt >= CHAIN_RETENTION_MS) {
        this.runs.delete(runId);
      }
    }
  }
}
