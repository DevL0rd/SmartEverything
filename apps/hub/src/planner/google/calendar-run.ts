import type {
  GoogleConflict,
  GoogleSyncCounts,
  PlannerCollectionRow,
} from '@smarteverything/domain';
import type { GoogleFailure } from '@smarteverything/google';
import type { z } from 'zod';

export class GoogleCallError extends Error {
  override readonly name = 'GoogleCallError';

  constructor(readonly failure: GoogleFailure) {
    super(`Google answered ${failure.kind}.`);
  }
}

type Tallied = Exclude<keyof GoogleSyncCounts, 'conflicts'>;

export type Tally = Readonly<Record<Tallied, number>>;

const TALLIED: readonly Tallied[] = ['pulled', 'created', 'updated', 'deleted', 'pushed'];

export class Run {
  readonly conflicts: GoogleConflict[] = [];
  private readonly tally: Record<Tallied, number> = {
    pulled: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    pushed: 0,
  };

  constructor(readonly profileId: string) {}

  count(name: Tallied, by = 1): void {
    this.tally[name] += by;
  }

  conflict(entry: GoogleConflict): void {
    this.conflicts.push(entry);
  }

  counts(): GoogleSyncCounts {
    return { ...this.tally, conflicts: this.conflicts.length };
  }

  tallied(): Tally {
    return { ...this.tally };
  }

  absorb(tally: Tally, conflicts: readonly GoogleConflict[]): void {
    for (const name of TALLIED) this.tally[name] += tally[name];
    this.conflicts.push(...conflicts);
  }
}

export interface CalendarScope {
  readonly profileId: string;
  readonly collection: PlannerCollectionRow;
  readonly calendarId: string;
  readonly zone: string | undefined;
  readonly readOnly: boolean;
}

export interface ScopedInput {
  readonly scope: CalendarScope;
  readonly position: number;
}

export interface ScopedOutcome<T> {
  readonly value: T;
  readonly position: number;
  readonly tally: Tally;
  readonly conflicts: readonly GoogleConflict[];
}

export interface CtxInit {
  readonly run: Run;
  readonly collection: PlannerCollectionRow;
  readonly calendarId: string;
  readonly zone: string | undefined;
  readonly readOnly: boolean;
  readonly position: number;
}

export class Ctx {
  readonly run: Run;
  readonly collection: PlannerCollectionRow;
  readonly calendarId: string;
  readonly zone: string | undefined;
  readonly readOnly: boolean;
  private position: number;

  constructor(init: CtxInit) {
    this.run = init.run;
    this.collection = init.collection;
    this.calendarId = init.calendarId;
    this.zone = init.zone;
    this.readOnly = init.readOnly;
    this.position = init.position;
  }

  next(): number {
    const value = this.position;
    this.position += 1;
    return value;
  }

  scope(): CalendarScope {
    return {
      profileId: this.run.profileId,
      collection: this.collection,
      calendarId: this.calendarId,
      zone: this.zone,
      readOnly: this.readOnly,
    };
  }

  scoped(): ScopedInput {
    return { scope: this.scope(), position: this.position };
  }

  absorb<T>(outcome: ScopedOutcome<T>): T {
    this.position = outcome.position;
    this.run.absorb(outcome.tally, outcome.conflicts);
    return outcome.value;
  }

  outcome<T>(value: T): ScopedOutcome<T> {
    return {
      value,
      position: this.position,
      tally: this.run.tallied(),
      conflicts: this.run.conflicts,
    };
  }
}

export function scopedCtx({ scope, position }: ScopedInput): Ctx {
  return new Ctx({ ...scope, run: new Run(scope.profileId), position });
}

export interface RequestSpec<T> {
  readonly profileId: string;
  readonly method: string;
  readonly url: string;
  readonly schema: z.ZodType<T>;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export type Requester = <T>(spec: RequestSpec<T>) => Promise<T>;
