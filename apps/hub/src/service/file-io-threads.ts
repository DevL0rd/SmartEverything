import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { env } from 'node:process';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_FILE_IO_THREADS,
  MAX_FILE_IO_THREADS,
  type DriveSettingsRunning,
} from '@smarteverything/domain';
import { z } from 'zod';

export type FileIoThreadsSource = 'saved' | 'unseeded';

export interface FileIoThreadsStart {
  readonly threads: number;
  readonly source: FileIoThreadsSource;
}

const STORED_ROW = z.object({ settings: z.string() });

const STORED_SETTINGS = z.looseObject({
  fileIoThreads: z.int().min(1).max(MAX_FILE_IO_THREADS).optional(),
});

let started: FileIoThreadsStart | null = null;

function savedThreads(databaseFile: string): number | null {
  if (!existsSync(databaseFile)) return null;
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    const row = database.prepare("select settings from ai_settings where key = 'drive'").get();
    if (row === undefined) return null;
    const json: unknown = JSON.parse(STORED_ROW.parse(row).settings);
    return STORED_SETTINGS.parse(json).fileIoThreads ?? null;
  } finally {
    database.close();
  }
}

function configuredThreads(databaseFile: string | null): FileIoThreadsStart {
  const saved = databaseFile === null ? null : savedThreads(databaseFile);
  return saved === null
    ? { threads: DEFAULT_FILE_IO_THREADS, source: 'unseeded' }
    : { threads: saved, source: 'saved' };
}

export function applyFileIoThreads(databaseFile: string | null): FileIoThreadsStart {
  const result = configuredThreads(databaseFile);
  env['UV_THREADPOOL_SIZE'] = String(result.threads);
  return result;
}

const POOL_THREAD_NAME = 'libuv-worker';

function poolThreads(): number {
  const tasks = readdirSync('/proc/self/task');
  return tasks.filter(
    (task) => readFileSync(`/proc/self/task/${task}/comm`, 'utf8').trim() === POOL_THREAD_NAME,
  ).length;
}

export async function confirmFileIoThreads(
  databaseFile: string | null,
): Promise<FileIoThreadsStart> {
  if (started !== null) {
    throw new Error('The file I/O threads were already confirmed in this process.');
  }
  const result = configuredThreads(databaseFile);
  await stat('/');
  const effective = poolThreads();
  if (env['UV_THREADPOOL_SIZE'] !== String(result.threads) || effective !== result.threads) {
    throw new Error(
      `The libuv file I/O thread pool has ${String(effective)} threads (UV_THREADPOOL_SIZE=${env['UV_THREADPOOL_SIZE'] ?? 'unset'}) but the configured value is ${String(result.threads)}. The pool was created before the service launcher set its size.`,
    );
  }
  started = result;
  return result;
}

export function fileIoThreadsStart(): FileIoThreadsStart {
  if (started === null) throw new Error('The file I/O threads were not applied at start.');
  return started;
}

export function runningFileIoThreads(): DriveSettingsRunning {
  return { fileIoThreads: fileIoThreadsStart().threads };
}
