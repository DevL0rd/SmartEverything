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
