import { randomUUID } from 'node:crypto';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { ScanCommitter } from '../scanner-commit';
import { ScanStepError, type ScanEntry } from '../scanner-drafts';
import type { Indexed } from '../scanner-index';
import { indexedAt, scopesOf } from '../scanner-scope';
import type { WalkEntry } from '../scanner-walk';

export type ScanStore = Pick<
  HostStore,
  'driveRoots' | 'driveItems' | 'driveInodes' | 'driveMissing' | 'now'
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
  readonly previous: number;
  readonly scopes: readonly string[] | null;
}

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
    },
    root,
    scopes,
  );
  SCANS.set(input.scanId, scan);
  return { previous: scan.previous, scopes };
}

export interface ScanApplyInput {
  readonly scanId: string;
  readonly entries: readonly ScanEntry[];
}

export function scanApply(_store: ScanStore, input: ScanApplyInput): void {
  scanOf(input.scanId).apply(input.entries);
}

export interface ScanSettleInput {
  readonly scanId: string;
  readonly unreadable: readonly string[];
}

export function scanSettle(_store: ScanStore, input: ScanSettleInput): readonly WalkEntry[] {
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

export function scanSweep(_store: ScanStore, input: ScanIdInput): boolean {
  return scanOf(input.scanId).sweep();
}

export function scanEnd(_store: ScanStore, input: ScanIdInput): void {
  SCANS.delete(input.scanId);
}

export const DRIVE_SCAN_BEGIN_UNIT = storeUnit(scanBegin);

export const DRIVE_SCAN_APPLY_UNIT = storeUnit(scanApply);

export const DRIVE_SCAN_SETTLE_UNIT = storeUnit(scanSettle);

export const DRIVE_SCAN_PLACE_UNIT = storeUnit(scanPlace);

export const DRIVE_SCAN_SWEEP_UNIT = storeUnit(scanSweep);

export const DRIVE_SCAN_END_UNIT = storeUnit(scanEnd);

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
