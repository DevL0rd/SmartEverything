import type { DriveRootPatch, StoredDrive } from '../store/repositories/drive-roots';
import type { Store } from '../store/store';
import type { ScanSettled } from './scan-steps';
import type {
  ScanApplyInput,
  ScanBegun,
  ScanBeginInput,
  ScanIdInput,
  ScanLoaded,
  ScanPlaceInput,
  ScanSettleInput,
} from './units/scan';

export interface ScanPort {
  readonly root: (rootId: string) => Promise<StoredDrive | undefined>;
  readonly update: (rootId: string, patch: DriveRootPatch) => Promise<StoredDrive>;
  readonly begin: (input: ScanBeginInput) => Promise<ScanBegun>;
  readonly load: (input: ScanIdInput) => Promise<ScanLoaded>;
  readonly apply: (input: ScanApplyInput) => Promise<number>;
  readonly settle: (input: ScanSettleInput) => Promise<ScanSettled>;
  readonly place: (input: ScanPlaceInput) => Promise<void>;
  readonly commit: (input: ScanIdInput) => Promise<boolean>;
  readonly end: (input: ScanIdInput) => Promise<void>;
}

export function hostScanPort(store: Pick<Store, 'host'>): ScanPort {
  const { host } = store;
  return {
    root: (rootId) => host.call('driveRoots', 'find', rootId),
    update: (rootId, patch) => host.call('driveRoots', 'update', rootId, patch),
    begin: (input) => host.write('driveScanBegin', input),
    load: (input) => host.write('driveScanLoad', input),
    apply: (input) => host.write('driveScanApply', input),
    settle: (input) => host.write('driveScanSettle', input),
    place: (input) => host.write('driveScanPlace', input),
    commit: (input) => host.write('driveScanCommit', input),
    end: (input) => host.write('driveScanEnd', input),
  };
}
