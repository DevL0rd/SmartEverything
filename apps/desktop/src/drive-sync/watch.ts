import { watch, type FSWatcher } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { normalizeSyncPath } from '@smarteverything/domain/drive-sync';
import type { DirtyTracker, EntryIdentity } from './dirty.js';

const QUEUE_LIMIT_FILE = '/proc/sys/fs/inotify/max_queued_events';
const QUEUE_LIMIT = z.coerce.number().int().positive();
const RESOURCE_CODES: ReadonlySet<string> = new Set(['ENOSPC', 'EMFILE', 'ENFILE']);
const MISSING_CODES: ReadonlySet<string> = new Set(['ENOENT', 'ENOTDIR']);

export interface WatchFailure {
  readonly reason: 'watch_limit' | 'watch_error';
  readonly error: Error;
}

export type WatchStart =
  | { readonly ok: true; readonly close: () => void }
  | { readonly ok: false; readonly failure: WatchFailure };

export interface WatchOptions {
  readonly tracker: Pick<DirtyTracker, 'mark' | 'markUnknown' | 'fail'>;
  readonly onFailure: (failure: WatchFailure) => void;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function classify(error: unknown): WatchFailure {
  const code = errorCode(error);
  return {
    reason: code !== undefined && RESOURCE_CODES.has(code) ? 'watch_limit' : 'watch_error',
    error: asError(error),
  };
}

export function toSyncPath(name: string): string {
  return normalizeSyncPath(name.split(path.sep).join('/'));
}

export async function readQueueLimit(): Promise<number | null> {
  if (process.platform !== 'linux') return null;
  return QUEUE_LIMIT.parse((await readFile(QUEUE_LIMIT_FILE, 'utf8')).trim());
}

export function startWatch(directory: string, options: WatchOptions): WatchStart {
  const { tracker, onFailure } = options;
  let watcher: FSWatcher;
  try {
    watcher = watch(directory, { recursive: true }, (_kind, name) => {
      if (name === null || name === '') {
        tracker.markUnknown();
      } else {
        tracker.mark(toSyncPath(name));
      }
    });
  } catch (error) {
    return { ok: false, failure: classify(error) };
  }
  watcher.on('error', (error: unknown) => {
    watcher.close();
    tracker.fail('watcher_error');
    onFailure(classify(error));
  });
  return {
    ok: true,
    close: (): void => {
      watcher.close();
    },
  };
}

export function statProbe(
  directory: string,
): (relPath: string) => Promise<EntryIdentity | undefined> {
  return async (relPath) => {
    try {
      const stats = await lstat(path.join(directory, ...relPath.split('/')), { bigint: true });
      const kind = stats.isFile() ? 'file' : stats.isDirectory() ? 'folder' : 'other';
      return { kind, bytes: kind === 'file' ? Number(stats.size) : 0, mtimeNs: stats.mtimeNs };
    } catch (error) {
      const code = errorCode(error);
      if (code !== undefined && MISSING_CODES.has(code)) return undefined;
      throw error;
    }
  };
}
