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

export function invalidateDriveChanged(client: QueryClient, notice: DriveChangedNotice): void {
  invalidateDriveReach(client, notice);
}
