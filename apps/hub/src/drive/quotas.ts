import type { DriveQuotaStatus } from '../store/repositories/drive-quotas';
import type { VolumeProbe } from './volumes';

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
  override readonly name = 'DriveFreeSpaceError';

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

export function checkDriveQuota(status: DriveQuotaSource, request: DriveWriteRequest): void {
  if (request.profileId === null) {
    return;
  }
  const { quota, usage } = status(request.profileId);
  if (quota === null) {
    return;
  }
  const used = usage.live + usage.versions + usage.trash;
  const growth = request.addBytes - request.releasedBytes;
  if (growth > 0 && used + growth > quota) {
    throw new DriveQuotaExceededError(request.profileId, quota, used, request.addBytes);
  }
}

export async function checkDriveFreeSpace(
  space: VolumeProbe['space'],
  path: string,
  bytes: number,
): Promise<void> {
  const { freeBytes } = await space(path);
  if (bytes > freeBytes) {
    throw new DriveFreeSpaceError(path, freeBytes, bytes);
  }
}

export interface DriveWriteCheck extends DriveWriteRequest {
  readonly path: string;
}

export interface DriveWriteGuard {
  readonly status: DriveQuotaSource;
  readonly space: VolumeProbe['space'];
}

export async function checkDriveWrite(
  guard: DriveWriteGuard,
  check: DriveWriteCheck,
): Promise<void> {
  checkDriveQuota(guard.status, check);
  await checkDriveFreeSpace(guard.space, check.path, check.addBytes);
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
