import { ApiError } from '@smarteverything/domain';
import type { DriveMountErrorName } from '@smarteverything/domain/drive-mount';
import { fsCode } from '../../fs-code';
import { DataSpaceError } from '../data-space';
import { DriveWriteError } from '../write-error';
import { DrivePathError, type DrivePathFailure } from '../paths';
import { DriveFileTooLargeError, DriveFreeSpaceError, DriveQuotaExceededError } from '../quotas';
import { RootMarkerError } from '../root-marker';
import type { DriveWriteFailure } from '../write-error';

export class PosixError extends Error {
  override readonly name = 'PosixError';

  constructor(
    readonly code: DriveMountErrorName,
    message: string,
    readonly rev?: number,
  ) {
    super(message);
  }
}

export function posix(code: DriveMountErrorName, message: string): PosixError {
  return new PosixError(code, message);
}

const WRITE_FAILURES: Readonly<Record<DriveWriteFailure, DriveMountErrorName>> = {
  exists: 'EEXIST',
  missing: 'ENOENT',
  corrupt: 'EIO',
};

const PATH_FAILURES: Readonly<Record<DrivePathFailure, DriveMountErrorName>> = {
  invalid: 'EINVAL',
  escape: 'ELOOP',
  missing: 'ENOENT',
  changed: 'ESTALE',
  'not-directory': 'ENOTDIR',
  denied: 'EACCES',
};

const API_CODES: Readonly<Record<string, DriveMountErrorName>> = {
  not_found: 'ENOENT',
  forbidden: 'EACCES',
  conflict: 'EEXIST',
  invalid_request: 'EINVAL',
};

const ERRNO_CODES: Readonly<Record<string, DriveMountErrorName>> = {
  ENOENT: 'ENOENT',
  EEXIST: 'EEXIST',
  ENOTEMPTY: 'ENOTEMPTY',
  ENOTDIR: 'ENOTDIR',
  EISDIR: 'EISDIR',
  EACCES: 'EACCES',
  EPERM: 'EPERM',
  EROFS: 'EACCES',
  EINVAL: 'EINVAL',
  ENOSPC: 'ENOSPC',
  EDQUOT: 'EDQUOT',
  EXDEV: 'EXDEV',
  ENAMETOOLONG: 'ENAMETOOLONG',
  ELOOP: 'ELOOP',
  EMLINK: 'EPERM',
  ENOTSUP: 'EOPNOTSUPP',
  EOPNOTSUPP: 'EOPNOTSUPP',
  EFBIG: 'EFBIG',
};

function refusalOfFile(cause: unknown): PosixError | undefined {
  const code = fsCode(cause);
  const mapped = code === undefined ? undefined : ERRNO_CODES[code];
  return mapped === undefined || !(cause instanceof Error)
    ? undefined
    : new PosixError(mapped, cause.message);
}

function refusalOfDrive(cause: unknown): PosixError | undefined {
  if (cause instanceof DriveWriteError) return posix(WRITE_FAILURES[cause.failure], cause.message);
  if (cause instanceof DrivePathError) return posix(PATH_FAILURES[cause.failure], cause.message);
  if (cause instanceof DriveQuotaExceededError) return posix('EDQUOT', cause.message);
  if (cause instanceof DriveFileTooLargeError) return posix('EFBIG', cause.message);
  if (cause instanceof DriveFreeSpaceError) return posix('ENOSPC', cause.message);
  if (cause instanceof DataSpaceError || cause instanceof RootMarkerError) {
    return posix('EIO', cause.message);
  }
  return undefined;
}

export function posixErrorOf(cause: unknown): PosixError | undefined {
  if (cause instanceof PosixError) return cause;
  const drive = refusalOfDrive(cause);
  if (drive !== undefined) return drive;
  if (cause instanceof ApiError) {
    const mapped = API_CODES[cause.code];
    return mapped === undefined ? undefined : posix(mapped, cause.message);
  }
  return refusalOfFile(cause);
}

export async function guarded<T>(operation: () => Promise<T> | T): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    throw posixErrorOf(cause) ?? cause;
  }
}
