import type { PrinterProblem } from '@smarteverything/domain';
import type { SupplyRow } from './model';
import type { WatchState } from './watch-state';

export const SETTLE_MS = 5_000;
const SAME_PROBLEM_MS = 60_000;
const SUPPLY_EVENT_MS = 3_600_000;
const REPLACED_JUMP = 10;
const REARM_MARGIN = 5;

export interface ProblemChanges {
  readonly added: readonly PrinterProblem[];
  readonly cleared: readonly PrinterProblem[];
  readonly recheckInMs: number | null;
}

export class ProblemTracker {
  readonly #active = new Map<string, PrinterProblem>();
  readonly #firstSeen = new Map<string, number>();
  readonly #absentSince = new Map<string, number>();
  readonly #announcedAt: Map<string, number>;

  constructor(restored: Pick<WatchState, 'problems' | 'problemAnnouncedAt'>) {
    for (const problem of restored.problems) this.#active.set(problem.keyword, problem);
    this.#announcedAt = new Map(Object.entries(restored.problemAnnouncedAt));
  }

  snapshot(): Pick<WatchState, 'problems' | 'problemAnnouncedAt'> {
    return {
      problems: [...this.#active.values()],
      problemAnnouncedAt: Object.fromEntries(this.#announcedAt),
    };
  }

  observe(problems: readonly PrinterProblem[], now: number): ProblemChanges {
    const present = new Map(problems.map((problem) => [problem.keyword, problem]));
    const arrivals = this.#arrivals(present, now);
    const departures = this.#departures(present, now);
    const waits = [...arrivals.waits, ...departures.waits];
    return {
      added: arrivals.added,
      cleared: departures.cleared,
      recheckInMs: waits.length === 0 ? null : Math.max(...waits),
    };
  }

  #arrivals(
    present: ReadonlyMap<string, PrinterProblem>,
    now: number,
  ): { added: PrinterProblem[]; waits: number[] } {
    const added: PrinterProblem[] = [];
    const waits: number[] = [];
    for (const [keyword, problem] of present) {
      this.#absentSince.delete(keyword);
      if (this.#active.has(keyword)) continue;
      const since = this.#firstSeen.get(keyword) ?? now;
      this.#firstSeen.set(keyword, since);
      if (now - since < SETTLE_MS) {
        waits.push(SETTLE_MS - (now - since));
        continue;
      }
      this.#active.set(keyword, problem);
      if (now - (this.#announcedAt.get(keyword) ?? -SAME_PROBLEM_MS) >= SAME_PROBLEM_MS) {
        this.#announcedAt.set(keyword, now);
        added.push(problem);
      }
    }
    for (const keyword of [...this.#firstSeen.keys()]) {
      if (!present.has(keyword) && !this.#active.has(keyword)) this.#firstSeen.delete(keyword);
    }
    return { added, waits };
  }

  #departures(
    present: ReadonlyMap<string, PrinterProblem>,
    now: number,
  ): { cleared: PrinterProblem[]; waits: number[] } {
    const cleared: PrinterProblem[] = [];
    const waits: number[] = [];
    for (const [keyword, problem] of this.#active) {
      if (present.has(keyword)) continue;
      const since = this.#absentSince.get(keyword) ?? now;
      this.#absentSince.set(keyword, since);
      if (now - since < SETTLE_MS) {
        waits.push(SETTLE_MS - (now - since));
        continue;
      }
      this.#active.delete(keyword);
      this.#firstSeen.delete(keyword);
      this.#absentSince.delete(keyword);
      cleared.push(problem);
    }
    return { cleared, waits };
  }

  get active(): readonly PrinterProblem[] {
    return [...this.#active.values()];
  }
}

export type SupplySignal =
  | { readonly kind: 'supply_low' | 'supply_empty'; readonly row: SupplyRow }
  | {
      readonly kind: 'supply_replaced';
      readonly row: SupplyRow;
      readonly certain: boolean;
      readonly acrossGap: boolean;
    };

export class SupplyTracker {
  readonly #levels: Map<string, number | null>;
  readonly #armed: Map<string, boolean>;
  readonly #announcedAt: Map<string, number>;
  #markerChange: number | null;
  #acrossGap: boolean;

  constructor(
    restored: Pick<WatchState, 'levels' | 'armed' | 'supplyAnnouncedAt'>,
    markerChange: number | null,
  ) {
    this.#levels = new Map(Object.entries(restored.levels));
    this.#armed = new Map(Object.entries(restored.armed));
    this.#announcedAt = new Map(Object.entries(restored.supplyAnnouncedAt));
    this.#markerChange = markerChange;
    this.#acrossGap = this.#levels.size > 0;
  }

  snapshot(): Pick<WatchState, 'levels' | 'armed' | 'supplyAnnouncedAt'> {
    return {
      levels: Object.fromEntries(this.#levels),
      armed: Object.fromEntries(this.#armed),
      supplyAnnouncedAt: Object.fromEntries(this.#announcedAt),
    };
  }

  observe(
    rows: readonly SupplyRow[],
    markerChange: number | null,
    now: number,
  ): readonly SupplySignal[] {
    const signals: SupplySignal[] = [];
    const moved =
      this.#markerChange !== null && markerChange !== null && markerChange !== this.#markerChange;
    const acrossGap = this.#acrossGap;
    this.#markerChange = markerChange;
    this.#acrossGap = false;
    for (const row of rows) {
      const before = this.#levels.get(row.key);
      this.#levels.set(row.key, row.level);
      const replaced = this.#replaced(row, before ?? null, moved, acrossGap);
      if (replaced !== null) {
        this.#rearm(row.key);
        signals.push({ kind: 'supply_replaced', row, certain: replaced, acrossGap });
        continue;
      }
      const alert = this.#alert(row, now);
      if (alert !== null) signals.push(alert);
    }
    return signals;
  }

  #replaced(
    row: SupplyRow,
    before: number | null,
    moved: boolean,
    acrossGap: boolean,
  ): boolean | null {
    if (row.level === null || before === null) return null;
    const rise = row.consumed ? row.level - before : before - row.level;
    if (acrossGap) return rise >= REPLACED_JUMP || (moved && rise >= REARM_MARGIN) ? false : null;
    return rise >= REPLACED_JUMP ? moved : null;
  }

  #rearm(key: string): void {
    this.#armed.set(`${key}:supply_low`, true);
    this.#armed.set(`${key}:supply_empty`, true);
  }

  #alert(row: SupplyRow, now: number): SupplySignal | null {
    if (row.standing === 'ok') {
      const cleared =
        row.level === null ||
        (row.consumed ? row.level : 100 - row.level) >= row.threshold + REARM_MARGIN;
      if (cleared) this.#rearm(row.key);
      return null;
    }
    if (row.standing === 'unknown') return null;
    const kind = row.standing === 'out' ? 'supply_empty' : 'supply_low';
    const key = `${row.key}:${kind}`;
    if (this.#armed.get(key) === false) return null;
    if (now - (this.#announcedAt.get(key) ?? -SUPPLY_EVENT_MS) < SUPPLY_EVENT_MS) return null;
    this.#announcedAt.set(key, now);
    this.#armed.set(key, false);
    return { kind, row };
  }
}
