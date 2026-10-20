export interface Tally {
  readonly sent: number;
  readonly failed: number;
  readonly removed: number;
  readonly reasons: readonly string[];
}

export const NOTHING: Tally = { sent: 0, failed: 0, removed: 0, reasons: [] };

export function added(tally: Tally, more: Tally): Tally {
  return {
    sent: tally.sent + more.sent,
    failed: tally.failed + more.failed,
    removed: tally.removed + more.removed,
    reasons: [...tally.reasons, ...more.reasons],
  };
}
