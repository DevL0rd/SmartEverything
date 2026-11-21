import type { Query, QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { DriveChangedNotice } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { DRIVE_PREFIX, type DriveWindowKind, type DriveWindowScope } from '../../../queries/keys';

const ID = z.string().min(1).nullable();

const WINDOW_KEY = z.tuple(
  [
    z.literal('window'),
    z.literal('drive'),
    z.string(),
    z.strictObject({ rootId: ID, folderId: ID, albumId: ID }).nullable(),
  ],
  z.unknown(),
);

export interface DriveChangeScope {
  readonly rootIds: readonly string[];
  readonly folderIds: readonly string[];
  readonly albumIds: readonly string[];
}

export interface DriveChangeReach extends DriveChangeScope {
  readonly months: readonly string[] | null;
}

export type MonthNarrowing = (key: readonly unknown[], months: readonly string[]) => boolean;

class DuplicateWindowNarrowingError extends Error {
  override readonly name = 'DuplicateWindowNarrowingError';

  constructor(readonly kind: DriveWindowKind) {
    super(`Two narrowings are registered for ${kind} windows; each kind has exactly one.`);
  }
}

const narrowings = new Map<string, MonthNarrowing>();

export function narrowDriveWindowsByMonth(
  kind: DriveWindowKind,
  narrowing: MonthNarrowing,
): () => void {
  if (narrowings.has(kind)) throw new DuplicateWindowNarrowingError(kind);
  narrowings.set(kind, narrowing);
  return () => {
    if (narrowings.get(kind) === narrowing) narrowings.delete(kind);
  };
}

export function reaches(scope: DriveWindowScope, reach: DriveChangeScope): boolean {
  if (scope.albumId !== null) return reach.albumIds.includes(scope.albumId);
  if (scope.folderId !== null) return reach.folderIds.includes(scope.folderId);
  if (scope.rootId !== null) return reach.rootIds.includes(scope.rootId);
  return true;
}

function monthReached(
  kind: string,
  rest: readonly unknown[],
  months: readonly string[] | null,
): boolean {
  if (months === null) return true;
  const narrowing = narrowings.get(kind);
  return narrowing === undefined || narrowing(rest, months);
}

function keyedBy(
  query: Query,
  reach: DriveChangeReach,
  kinds: ReadonlySet<string> | null,
): boolean {
  const key = WINDOW_KEY.safeParse(query.queryKey);
  if (!key.success || key.data[3] === null) return false;
  if (kinds !== null && !kinds.has(key.data[2])) return false;
  if (!reaches(key.data[3], reach)) return false;
  return monthReached(key.data[2], key.data.slice(4), reach.months);
}

export function invalidateDriveReach(
  client: QueryClient,
  reach: DriveChangeReach,
  kinds: readonly DriveWindowKind[] | null = null,
): void {
  const only = kinds === null ? null : new Set(kinds);
  background(
    client.invalidateQueries({
      queryKey: DRIVE_PREFIX,
      predicate: (query) => keyedBy(query, reach, only),
    }),
    'queries.invalidate_failed',
  );
}

function union(first: readonly string[], second: readonly string[]): readonly string[] {
  return [...new Set([...first, ...second])];
}

function mergedReach(first: DriveChangeReach | null, second: DriveChangeReach): DriveChangeReach {
  if (first === null) return second;
  return {
    rootIds: union(first.rootIds, second.rootIds),
    folderIds: union(first.folderIds, second.folderIds),
    albumIds: union(first.albumIds, second.albumIds),
    months:
      first.months === null || second.months === null ? null : union(first.months, second.months),
  };
}

class ChangeRounds {
  #pending: DriveChangeReach | null = null;
  #running = false;

  constructor(private readonly client: QueryClient) {}

  receive(reach: DriveChangeReach): void {
    if (this.#running) {
      this.#pending = mergedReach(this.#pending, reach);
      return;
    }
    this.#start(reach, new Set());
  }

  #start(reach: DriveChangeReach | null, carried: ReadonlySet<Query>): void {
    this.#running = true;
    const busy = new Set<Query>();
    const settled = this.client.invalidateQueries(
      {
        queryKey: DRIVE_PREFIX,
        predicate: (query) => {
          const hit = carried.has(query) || (reach !== null && keyedBy(query, reach, null));
          if (hit && query.state.fetchStatus === 'fetching') busy.add(query);
          return hit;
        },
      },
      { cancelRefetch: false },
    );
    background(
      settled.finally(() => {
        this.#settle(busy);
      }),
      'queries.invalidate_failed',
    );
  }

  #settle(busy: ReadonlySet<Query>): void {
    const next = this.#pending;
    this.#pending = null;
    if (next === null && busy.size === 0) {
      this.#running = false;
      return;
    }
    this.#start(next, busy);
  }
}

const rounds = new WeakMap<QueryClient, ChangeRounds>();

function roundsOf(client: QueryClient): ChangeRounds {
  const known = rounds.get(client);
  if (known !== undefined) return known;
  const created = new ChangeRounds(client);
  rounds.set(client, created);
  return created;
}

export function invalidateDriveChanged(client: QueryClient, notice: DriveChangedNotice): void {
  roundsOf(client).receive(notice);
}
