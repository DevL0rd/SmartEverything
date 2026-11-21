import type { DriveRootPatch, StoredDrive } from '../store/repositories/drive-roots';
import type { Store } from '../store/store';
import type {
  ScanApplyInput,
  ScanBegun,
  ScanBeginInput,
  ScanIdInput,
  ScanPlaceInput,
  ScanSettleInput,
} from './units/scan';
import type { WalkEntry } from './scanner-walk';

export interface ScanPort {
  readonly root: (rootId: string) => Promise<StoredDrive | undefined>;
  readonly update: (rootId: string, patch: DriveRootPatch) => Promise<StoredDrive>;
  readonly begin: (input: ScanBeginInput) => Promise<ScanBegun>;
  readonly apply: (input: ScanApplyInput) => Promise<void>;
  readonly settle: (input: ScanSettleInput) => Promise<readonly WalkEntry[]>;
  readonly place: (input: ScanPlaceInput) => Promise<void>;
  readonly sweep: (input: ScanIdInput) => Promise<boolean>;
  readonly end: (input: ScanIdInput) => Promise<void>;
}

export function hostScanPort(store: Pick<Store, 'host'>): ScanPort {
  const { host } = store;
  return {
    root: (rootId) => host.call('driveRoots', 'find', rootId),
    update: (rootId, patch) => host.call('driveRoots', 'update', rootId, patch),
    begin: (input) => host.write('driveScanBegin', input),
    apply: (input) => host.write('driveScanApply', input),
    settle: (input) => host.write('driveScanSettle', input),
    place: (input) => host.write('driveScanPlace', input),
    sweep: (input) => host.write('driveScanSweep', input),
    end: (input) => host.write('driveScanEnd', input),
  };
}
