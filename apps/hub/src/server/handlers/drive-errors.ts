import { ApiError, type ApiErrorCode } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { DriveAlbumKindError } from '../../store/repositories/drive-albums';
import {
  DriveAlbumAccessError,
  DriveAlbumCursorError,
  DriveAlbumItemError,
} from '../../drive/albums';
import { ConflictError } from '../../drive/conflicts';
import { DriveWriteError, type DriveWriteFailure } from '../../drive/intents';
import { DrivePathError, RootPlacementError } from '../../drive/paths';
import { DriveFreeSpaceError, DriveQuotaExceededError } from '../../drive/quotas';
import { RootMarkerError } from '../../drive/root-marker';
import { DriveCursorError, DriveFolderRequiredError } from '../../drive/search';
import { VolumeError } from '../../drive/volumes';

type ErrorClass = abstract new (...args: never) => Error;

const WRITE_CODES: Readonly<Record<DriveWriteFailure, ApiErrorCode>> = {
  'read-only': 'forbidden',
  'no-physical-root': 'forbidden',
  exists: 'conflict',
  missing: 'not_found',
  corrupt: 'internal',
};

const CONFLICT_CODES: Readonly<Record<ConflictError['failure'], ApiErrorCode>> = {
  unknown: 'not_found',
  resolved: 'conflict',
  'copy-missing': 'not_found',
};

const CODES: readonly (readonly [ErrorClass, ApiErrorCode])[] = [
  [DriveAlbumAccessError, 'not_found'],
  [DriveAlbumItemError, 'invalid_request'],
  [DriveAlbumCursorError, 'invalid_request'],
  [DriveAlbumKindError, 'invalid_request'],
  [DriveCursorError, 'invalid_request'],
  [DriveFolderRequiredError, 'invalid_request'],
  [DrivePathError, 'invalid_request'],
  [RootPlacementError, 'invalid_request'],
  [RootMarkerError, 'conflict'],
  [VolumeError, 'invalid_request'],
  [DriveQuotaExceededError, 'command_refused'],
  [DriveFreeSpaceError, 'command_refused'],
];

export function driveErrorCode(cause: unknown): ApiErrorCode | null {
  if (cause instanceof DriveWriteError) return WRITE_CODES[cause.failure];
  if (cause instanceof ConflictError) return CONFLICT_CODES[cause.failure];
  for (const [type, code] of CODES) {
    if (cause instanceof type) return code;
  }
  return null;
}

export async function refusing<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    const code = driveErrorCode(cause);
    if (code === null || code === 'internal') throw cause;
    throw new ApiError(code, messageOf(cause));
  }
}
