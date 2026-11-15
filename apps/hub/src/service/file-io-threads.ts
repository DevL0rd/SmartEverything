import { existsSync } from 'node:fs';
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

export function applyFileIoThreads(databaseFile: string | null): FileIoThreadsStart {
  if (started !== null) {
    throw new Error('The file I/O threads were already applied in this process.');
  }
  const saved = databaseFile === null ? null : savedThreads(databaseFile);
  const result: FileIoThreadsStart =
    saved === null
      ? { threads: DEFAULT_FILE_IO_THREADS, source: 'unseeded' }
      : { threads: saved, source: 'saved' };
  env['UV_THREADPOOL_SIZE'] = String(result.threads);
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
