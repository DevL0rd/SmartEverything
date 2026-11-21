import type { DriveQuotaStatus } from '../store/repositories/drive-quotas';
import type { Store } from '../store/store';
import type { DataSpaceProbe } from './data-space';

export type DriveQuotaSource = (profileId: string) => DriveQuotaStatus;

export interface DriveWriteRequest {
  readonly profileId: string | null;
  readonly addBytes: number;
  readonly releasedBytes: number;
}

export class DriveQuotaExceededError extends Error {
  override readonly name = 'DriveQuotaExceededError';

  constructor(
    readonly profileId: string,
    readonly quotaBytes: number,
    readonly usedBytes: number,
    readonly requestedBytes: number,
  ) {
    super(
      `The space limit is ${String(quotaBytes)} bytes and ${String(usedBytes)} bytes are in use, so ${String(requestedBytes)} more bytes cannot be added. Nothing was removed to make room.`,
    );
  }
}

export class DriveFreeSpaceError extends Error {
  override readonly name: string = 'DriveFreeSpaceError';

  constructor(
    readonly path: string,
    readonly freeBytes: number,
    readonly requestedBytes: number,
  ) {
    super(
      `The disk holding ${path} has ${String(freeBytes)} bytes free, which is not enough for ${String(requestedBytes)} bytes.`,
    );
  }
}

export class DriveFileTooLargeError extends DriveFreeSpaceError {
  override readonly name = 'DriveFileTooLargeError';

  constructor(
    path: string,
    freeBytes: number,
    requestedBytes: number,
    readonly totalBytes: number,
  ) {
    super(path, freeBytes, requestedBytes);
    this.message = `The disk holding ${path} holds ${String(totalBytes)} bytes in all, so ${String(requestedBytes)} bytes can never fit on it.`;
  }
}

export function checkDriveQuota(status: DriveQuotaSource, request: DriveWriteRequest): void {
  if (request.profileId === null) {
    return;
  }
  const current = status(request.profileId);
  const { quota } = current;
  if (quota === null) {
    return;
  }
  const { usage } = current;
  const used = usage.live + usage.versions + usage.trash;
  const growth = request.addBytes - request.releasedBytes;
  if (growth > 0 && used + growth > quota) {
    throw new DriveQuotaExceededError(request.profileId, quota, used, request.addBytes);
  }
}

export async function loadedQuotaCheck(
  store: Pick<Store, 'host'>,
  request: DriveWriteRequest,
): Promise<void> {
  if (request.profileId === null) return;
  const status = await store.host.call('driveQuotas', 'status', request.profileId);
  checkDriveQuota(() => status, request);
}

export async function checkDriveFreeSpace(
  space: DataSpaceProbe['space'],
  path: string,
  bytes: number,
): Promise<void> {
  const { freeBytes, totalBytes } = await space(path);
  if (bytes > totalBytes) {
    throw new DriveFileTooLargeError(path, freeBytes, bytes, totalBytes);
  }
  if (bytes > freeBytes) {
    throw new DriveFreeSpaceError(path, freeBytes, bytes);
  }
}

export interface DriveWriteCheck extends DriveWriteRequest {
  readonly path: string;
}

export interface DriveWriteGuard {
  readonly status: DriveQuotaSource;
  readonly space: DataSpaceProbe['space'];
}

export async function checkDriveWrite(
  guard: DriveWriteGuard,
  check: DriveWriteCheck,
): Promise<void> {
  checkDriveQuota(guard.status, check);
  await checkDriveFreeSpace(guard.space, check.path, check.addBytes);
}

export async function checkLoadedDriveWrite(
  store: Pick<Store, 'host'>,
  space: DataSpaceProbe['space'],
  check: DriveWriteCheck,
): Promise<void> {
  await loadedQuotaCheck(store, check);
  await checkDriveFreeSpace(space, check.path, check.addBytes);
}

export class DriveQuotaMeter {
  private received = 0;

  constructor(
    private readonly status: DriveQuotaSource,
    private readonly profileId: string | null,
    private readonly releasedBytes = 0,
  ) {}

  admit(chunkBytes: number): void {
    this.received += chunkBytes;
    checkDriveQuota(this.status, {
      profileId: this.profileId,
      addBytes: this.received,
      releasedBytes: this.releasedBytes,
    });
  }
}
