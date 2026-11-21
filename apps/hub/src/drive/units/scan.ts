import { randomUUID } from 'node:crypto';
import type { HostStore } from '../../store/host/host-store';
import { bareStoreUnit, storeUnit } from '../../store/host/unit';
import { ScanCommitter } from '../scanner-commit';
import type { ScanSettled } from '../scan-steps';
import { ScanStepError, type ScanEntry } from '../scanner-drafts';
import type { Indexed } from '../scanner-index';
import { indexedAt, scopesOf } from '../scanner-scope';

export type ScanStore = Pick<
  HostStore,
  'driveRoots' | 'driveItems' | 'driveInodes' | 'driveMissing' | 'now' | 'write'
>;

const SCANS = new Map<string, ScanCommitter>();

function scanOf(scanId: string): ScanCommitter {
  const scan = SCANS.get(scanId);
  if (scan === undefined) throw new ScanStepError(`The scan ${scanId} is not running.`);
  return scan;
}

export interface ScanBeginInput {
  readonly scanId: string;
  readonly rootId: string;
  readonly paths: readonly string[] | null;
}

export interface ScanBegun {
  readonly scopes: readonly string[] | null;
}

export type ScanLoaded =
  { readonly more: true } | { readonly more: false; readonly previous: number };

export function scanBegin(store: ScanStore, input: ScanBeginInput): ScanBegun {
  if (SCANS.has(input.scanId)) throw new ScanStepError(`The scan ${input.scanId} already runs.`);
  const root = store.driveRoots.byId(input.rootId);
  const scopes = input.paths === null ? null : scopesOf(store.driveItems, root.id, input.paths);
  const scan = new ScanCommitter(
    {
      items: store.driveItems,
      inodes: store.driveInodes,
      missing: store.driveMissing,
      now: store.now,
      newId: randomUUID,
      write: store.write,
    },
    root,
    scopes,
  );
  SCANS.set(input.scanId, scan);
  return { scopes };
}

export function scanLoad(_store: ScanStore, input: ScanIdInput): ScanLoaded {
  const scan = scanOf(input.scanId);
  return scan.load() ? { more: true } : { more: false, previous: scan.previous };
}

export interface ScanApplyInput {
  readonly scanId: string;
  readonly entries: readonly ScanEntry[];
}

export function scanApply(_store: ScanStore, input: ScanApplyInput): number {
  return scanOf(input.scanId).apply(input.entries);
}

export interface ScanSettleInput {
  readonly scanId: string;
  readonly unreadable: readonly string[];
}

export function scanSettle(_store: ScanStore, input: ScanSettleInput): ScanSettled {
  return scanOf(input.scanId).settle(input.unreadable);
}

export interface ScanPlaceInput {
  readonly scanId: string;
  readonly hashes: readonly (string | null)[];
}

export function scanPlace(_store: ScanStore, input: ScanPlaceInput): void {
  scanOf(input.scanId).place(input.hashes);
}

export interface ScanIdInput {
  readonly scanId: string;
}

export function scanCommit(_store: ScanStore, input: ScanIdInput): boolean {
  return scanOf(input.scanId).commit();
}

export function scanEnd(_store: ScanStore, input: ScanIdInput): void {
  SCANS.delete(input.scanId);
}

export const DRIVE_SCAN_BEGIN_UNIT = bareStoreUnit(scanBegin);

export const DRIVE_SCAN_LOAD_UNIT = bareStoreUnit(scanLoad);

export const DRIVE_SCAN_APPLY_UNIT = bareStoreUnit(scanApply);

export const DRIVE_SCAN_SETTLE_UNIT = bareStoreUnit(scanSettle);

export const DRIVE_SCAN_PLACE_UNIT = bareStoreUnit(scanPlace);

export const DRIVE_SCAN_COMMIT_UNIT = bareStoreUnit(scanCommit);

export const DRIVE_SCAN_END_UNIT = bareStoreUnit(scanEnd);

export interface ScanIndexedInput {
  readonly rootId: string;
  readonly relPaths: readonly string[];
}

export function scanIndexed(
  store: Pick<HostStore, 'driveItems' | 'driveInodes'>,
  input: ScanIndexedInput,
): readonly Indexed[] {
  const reader = { items: store.driveItems, inodes: store.driveInodes };
  return input.relPaths.flatMap((relPath) => {
    const indexed = indexedAt(reader, input.rootId, relPath);
    return indexed === undefined ? [] : [indexed];
  });
}

export const DRIVE_SCAN_INDEXED_UNIT = storeUnit(scanIndexed);
