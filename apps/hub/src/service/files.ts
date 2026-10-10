import { createWriteStream, watch, type FSWatcher, type WriteStream } from 'node:fs';
import { rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderJson, type LogSink } from '@smarteverything/logging';
import {
  RESTART_REQUEST_FILE,
  SERVICE_LOG_FILE,
  SERVICE_PID_FILE,
  SERVICE_READY_FILE,
  type ServiceReady,
} from './configuration';
import { LogLines } from './log-lines';

const LOG_ROTATE_BYTES = 10 * 1024 * 1024;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return 0;
    }
    throw error;
  }
}

export interface LogFile {
  readonly sink: LogSink;
  readonly lines: LogLines;
  readonly close: () => Promise<void>;
}

export async function openAppendStream(path: string): Promise<WriteStream> {
  if ((await sizeOf(path)) > LOG_ROTATE_BYTES) {
    await rename(path, `${path}.1`);
  }
  return createWriteStream(path, { flags: 'a', mode: 0o600 });
}

export async function openLogFile(dataDirectory: string): Promise<LogFile> {
  const stream = await openAppendStream(join(dataDirectory, SERVICE_LOG_FILE));
  const lines = new LogLines();
  return {
    sink: (record): void => {
      const line = renderJson(record);
      stream.write(`${line}\n`);
      lines.write(line);
    },
    lines,
    close: () =>
      new Promise((resolve) => {
        stream.end(resolve);
      }),
  };
}

export interface PidFile {
  readonly remove: () => Promise<void>;
}

export async function writePidFile(
  dataDirectory: string,
  processId: number,
  name = SERVICE_PID_FILE,
): Promise<PidFile> {
  const path = join(dataDirectory, name);
  await writeFile(path, `${String(processId)}\n`, { mode: 0o600 });
  return { remove: () => rm(path, { force: true }) };
}

export interface ReadyFile {
  readonly remove: () => Promise<void>;
}

export async function writeReadyFile(
  dataDirectory: string,
  ready: ServiceReady,
): Promise<ReadyFile> {
  const path = join(dataDirectory, SERVICE_READY_FILE);
  const staged = `${path}.${String(ready.pid)}`;
  await writeFile(staged, `${JSON.stringify(ready)}\n`, { mode: 0o600 });
  await rename(staged, path);
  return { remove: () => rm(path, { force: true }) };
}

export interface RequestWatch {
  readonly stop: () => void;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return false;
    }
    throw error;
  }
}

export interface RequestHandlers {
  readonly requested: () => void;
  readonly failed: (cause: unknown) => void;
}

export async function watchRequest(
  dataDirectory: string,
  file: string,
  handlers: RequestHandlers,
): Promise<RequestWatch> {
  const path = join(dataDirectory, file);
  await rm(path, { force: true });
  let fired = false;
  const watcher: FSWatcher = watch(dataDirectory, (_event, name) => {
    if (name !== file || fired) {
      return;
    }
    exists(path).then((present) => {
      if (present && !fired) {
        fired = true;
        handlers.requested();
      }
    }, handlers.failed);
  });
  watcher.on('error', handlers.failed);
  return {
    stop: (): void => {
      watcher.close();
    },
  };
}

export function watchRestartRequests(
  dataDirectory: string,
  handlers: RequestHandlers,
): Promise<RequestWatch> {
  return watchRequest(dataDirectory, RESTART_REQUEST_FILE, handlers);
}

export function clearRequest(dataDirectory: string, file: string): Promise<void> {
  return rm(join(dataDirectory, file), { force: true });
}
