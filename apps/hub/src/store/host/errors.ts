import { API_ERROR_CODES, ApiError } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { StoreNotFoundError } from '../context';
import { StoreConflictError } from '../sql';
import { DRIVE_WRITE_FAILURES, DriveWriteError } from '../../drive/write-error';
import { PosixError } from '../../drive/posix/errors';
import { ERROR_NAMES as DRIVE_MOUNT_ERROR_NAMES } from '@smarteverything/domain/drive-mount';
import {
  DshSessionDurabilityError,
  DshSessionStorageError,
} from '../repositories/dsh-session-errors';
import {
  DriveAlbumAccessError,
  DriveAlbumCursorError,
  DriveAlbumItemError,
} from '../../drive/albums';
import { DriveAlbumKindError } from '../repositories/drive-albums';
import { HarnessConfigurationStorageError } from '../repositories/harness-configuration';
import type { HostError } from './protocol';

export class StoreHostError extends Error {
  override readonly name = 'StoreHostError';

  constructor(
    readonly hostName: string,
    message: string,
    readonly hostStack: string | null,
  ) {
    super(`${hostName}: ${message}`);
  }
}

export class StoreHostStoppedError extends Error {
  override readonly name = 'StoreHostStoppedError';

  constructor(reason: string) {
    super(`The store host stopped: ${reason}.`);
  }
}

function albumFields(cause: unknown): Record<string, string> {
  if (cause instanceof DriveAlbumAccessError || cause instanceof DriveAlbumCursorError)
    return { albumId: cause.albumId };
  if (cause instanceof DriveAlbumItemError) return { itemId: cause.itemId, reason: cause.reason };
  if (cause instanceof DriveAlbumKindError) return { albumId: cause.albumId, kind: cause.kind };
  return {};
}

function storeFields(cause: unknown): Record<string, string> {
  if (cause instanceof StoreNotFoundError) return { what: cause.what, key: cause.key };
  if (cause instanceof StoreConflictError)
    return { operation: cause.operation, cause: messageOf(cause.cause) };
  if (cause instanceof DriveWriteError) return { failure: cause.failure };
  if (cause instanceof PosixError)
    return { code: cause.code, ...(cause.rev === undefined ? {} : { rev: String(cause.rev) }) };
  if (cause instanceof DshSessionStorageError)
    return { sessionId: cause.sessionId, code: cause.code, reason: cause.reason };
  if (cause instanceof DshSessionDurabilityError) return { reason: cause.reason };
  if (cause instanceof HarnessConfigurationStorageError)
    return { revision: cause.revision, code: cause.code, reason: cause.reason };
  return albumFields(cause);
}

function apiFields(cause: ApiError): Record<string, string> {
  return {
    code: cause.code,
    ...(cause.reason === null ? {} : { reason: cause.reason }),
    ...(cause.retryAfterSeconds === null
      ? {}
      : { retryAfterSeconds: String(cause.retryAfterSeconds) }),
  };
}

export function hostErrorOf(cause: unknown): HostError {
  const fields = cause instanceof ApiError ? apiFields(cause) : storeFields(cause);
  return {
    name: cause instanceof Error ? cause.name : typeof cause,
    message: messageOf(cause),
    stack: cause instanceof Error && cause.stack !== undefined ? cause.stack : null,
    fields,
  };
}

function field(error: HostError, name: string): string {
  const value = error.fields[name];
  if (value === undefined) throw new StoreHostError(error.name, error.message, error.stack);
  return value;
}

const API_CODE = z.enum(API_ERROR_CODES);

const DRIVE_WRITE_FAILURE = z.enum(DRIVE_WRITE_FAILURES);

const DSH_STORAGE_CODE = z.enum([
  'ownership-lost',
  'forbidden',
  'sequence',
  'receipt',
  'corruption',
]);

function apiErrorOf(error: HostError): ApiError {
  const retry = error.fields['retryAfterSeconds'];
  return new ApiError(
    API_CODE.parse(field(error, 'code')),
    error.message,
    error.fields['reason'] ?? null,
    retry === undefined ? null : Number(retry),
  );
}

const POSIX_CODE = z.enum(DRIVE_MOUNT_ERROR_NAMES);

const HARNESS_STORAGE_CODE = z.enum(['host-mismatch', 'invalid-report']);

const ALBUM_ITEM_REFUSAL = z.enum(['missing', 'folder', 'out-of-reach']);

const ALBUM_KIND = z.enum(['manual', 'smart']);

function albumErrorOf(error: HostError): Error | null {
  if (error.name === 'DriveAlbumAccessError')
    return new DriveAlbumAccessError(field(error, 'albumId'));
  if (error.name === 'DriveAlbumCursorError')
    return new DriveAlbumCursorError(field(error, 'albumId'));
  if (error.name === 'DriveAlbumItemError')
    return new DriveAlbumItemError(
      field(error, 'itemId'),
      ALBUM_ITEM_REFUSAL.parse(field(error, 'reason')),
    );
  if (error.name === 'DriveAlbumKindError')
    return new DriveAlbumKindError(field(error, 'albumId'), ALBUM_KIND.parse(field(error, 'kind')));
  return null;
}

function posixErrorOf(error: HostError): PosixError {
  const rev = error.fields['rev'];
  return new PosixError(
    POSIX_CODE.parse(field(error, 'code')),
    error.message,
    rev === undefined ? undefined : Number(rev),
  );
}

export function errorOfHost(error: HostError): Error {
  if (error.name === 'ApiError') return apiErrorOf(error);
  if (error.name === 'DriveWriteError')
    return new DriveWriteError(DRIVE_WRITE_FAILURE.parse(field(error, 'failure')), error.message);
  if (error.name === 'PosixError') return posixErrorOf(error);
  if (error.name === 'DshSessionStorageError')
    return new DshSessionStorageError(
      field(error, 'sessionId'),
      DSH_STORAGE_CODE.parse(field(error, 'code')),
      field(error, 'reason'),
    );
  if (error.name === 'DshSessionDurabilityError')
    return new DshSessionDurabilityError(field(error, 'reason'));
  if (error.name === 'HarnessConfigurationStorageError')
    return new HarnessConfigurationStorageError(
      field(error, 'revision'),
      HARNESS_STORAGE_CODE.parse(field(error, 'code')),
      field(error, 'reason'),
    );
  const album = albumErrorOf(error);
  if (album !== null) return album;
  if (error.name === 'StoreNotFoundError')
    return new StoreNotFoundError(field(error, 'what'), field(error, 'key'));
  if (error.name === 'StoreConflictError')
    return new StoreConflictError(field(error, 'operation'), new Error(field(error, 'cause')));
  return new StoreHostError(error.name, error.message, error.stack);
}
