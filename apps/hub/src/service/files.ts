import { createWriteStream, watch, type FSWatcher, type WriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { ComputerServiceReady } from '@smarteverything/domain';
import { renderJson, type LogSink } from '@smarteverything/logging';
import type { ServiceReady } from './configuration';
import { LogLines } from './log-lines';
import { isMissing } from '../fs-util';

const LOG_ROTATE_BYTES = 10 * 1024 * 1024;

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (isMissing(error)) {
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
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  if ((await sizeOf(path)) > LOG_ROTATE_BYTES) {
    await rename(path, `${path}.1`);
  }
  return appendStream(path);
}

async function appendStream(path: string): Promise<WriteStream> {
  return createWriteStream(path, { fd: await open(path, 'a', 0o600) });
}

export type LogRotationFailed = (cause: unknown) => void;

class RotatingLog {
  private readonly queue: string[] = [];
  private rotation: Promise<void> | null = null;

  constructor(
    private readonly path: string,
    private stream: WriteStream,
    private written: number,
    private readonly failed: LogRotationFailed,
  ) {}

  write(line: string): void {
    this.queue.push(line);
    if (this.rotation === null) this.drain();
  }

  async close(): Promise<void> {
    while (this.rotation !== null) await this.rotation;
    await new Promise<void>((resolve) => {
      this.stream.end(resolve);
    });
  }

  private drain(): void {
    for (let line = this.queue.shift(); line !== undefined; line = this.queue.shift()) {
      this.stream.write(line);
      this.written += Buffer.byteLength(line);
      if (this.written > LOG_ROTATE_BYTES) {
        this.rotation = this.rotate();
        this.rotation.catch(this.failed);
        return;
      }
    }
  }

  private async rotate(): Promise<void> {
    const previous = this.stream;
    await new Promise<void>((resolve) => {
      previous.end(resolve);
    });
    this.written = 0;
    try {
      await rename(this.path, `${this.path}.1`);
    } catch (cause) {
      this.failed(cause);
    }
    this.stream = await appendStream(this.path);
    this.rotation = null;
    this.drain();
  }
}

export async function openLogFile(path: string, failed: LogRotationFailed): Promise<LogFile> {
  const stream = await openAppendStream(path);
  const log = new RotatingLog(path, stream, await sizeOf(path), failed);
  const lines = new LogLines();
  return {
    sink: (record): void => {
      const line = `${renderJson(record)}\n`;
      log.write(line);
      lines.write(line.slice(0, -1));
    },
    lines,
    close: () => log.close(),
  };
}

export interface PidFile {
  readonly remove: () => Promise<void>;
}

export async function writePidFile(path: string, processId: number): Promise<PidFile> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${String(processId)}\n`, { mode: 0o600 });
  return { remove: () => rm(path, { force: true }) };
}

export interface ReadyFile {
  readonly remove: () => Promise<void>;
}

export async function writeReadyFile(
  path: string,
  ready: ServiceReady | ComputerServiceReady,
): Promise<ReadyFile> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
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
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

export interface RequestHandlers {
  readonly requested: () => void;
  readonly failed: (cause: unknown) => void;
}

export async function watchRequest(path: string, handlers: RequestHandlers): Promise<RequestWatch> {
  const directory = dirname(path);
  const file = basename(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await rm(path, { force: true });
  let fired = false;
  const watcher: FSWatcher = watch(directory, (_event, name) => {
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

export function clearRequest(path: string): Promise<void> {
  return rm(path, { force: true });
}
