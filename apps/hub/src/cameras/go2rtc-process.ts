import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { REDACTED, type Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { IceServer } from '@smarteverything/domain';
import { ffmpegPath } from '../media/ffmpeg-path';
import { go2rtcConfig } from './go2rtc-config';

export const GO2RTC_USERNAME = 'hub';

export interface Go2rtcLaunch {
  readonly binary: string;
  readonly dataDirectory: string;
  readonly apiPort: number;
  readonly rtspPort: number;
  readonly webrtcPort: number;
  readonly candidates: readonly string[];
  readonly iceServers: readonly IceServer[];
  readonly password: string;
  readonly xiaomi: Readonly<Record<string, string>>;
  readonly log: Logger;
  readonly exited: (cause: Error) => void;
  readonly reported: (text: string) => void;
}

export interface RunningGo2rtc {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  readonly stop: () => Promise<void>;
}

const SHUTDOWN_GRACE_MS = 1000;

class Go2rtcExitedError extends Error {
  override readonly name = 'Go2rtcExitedError';

  constructor(code: number | null, signal: string | null) {
    super(`go2rtc exited unexpectedly with code ${String(code)} and signal ${String(signal)}.`);
  }
}

const LOG_LINE = z
  .object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'panic']),
    message: z.string().optional(),
    error: z.string().optional(),
    caller: z.string().optional(),
  })
  .refine((line) => line.message !== undefined || line.error !== undefined);

type LogLine = z.infer<typeof LOG_LINE>;

const URL_QUERY = /([a-z][a-z0-9+.-]*:\/\/[^\s"?]*)\?[^\s"]*/gi;

function withoutQueries(text: string): string {
  return text.replace(URL_QUERY, `$1?${REDACTED}`);
}

function detailsOf(line: LogLine): Readonly<Record<string, string>> {
  return {
    ...(line.message === undefined ? {} : { message: withoutQueries(line.message) }),
    ...(line.error === undefined ? {} : { error: withoutQueries(line.error) }),
    ...(line.caller === undefined ? {} : { caller: line.caller }),
  };
}

function parsedLine(text: string): LogLine | null {
  if (!text.startsWith('{')) {
    return null;
  }
  try {
    const parsed = LOG_LINE.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

function relay(launch: Go2rtcLaunch, text: string): boolean {
  const log = launch.log;
  const line = parsedLine(text);
  if (line === null) {
    log.debug('go2rtc.output', { text });
    return false;
  }
  const details = detailsOf(line);
  launch.reported(`${line.message ?? ''} ${line.error ?? ''}`);
  if (line.level === 'error' || line.level === 'fatal' || line.level === 'panic') {
    log.error('go2rtc.reported', undefined, { level: line.level, ...details });
  } else if (line.level === 'warn') {
    log.warn('go2rtc.reported', details);
  } else {
    log.debug('go2rtc.reported', () => ({ level: line.level, ...details }));
  }
  return line.message?.startsWith('[api] listen') === true;
}

type Go2rtcChild = ChildProcessByStdio<null, Readable, Readable>;

function awaitReady(child: Go2rtcChild, launch: Go2rtcLaunch): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => {
      reject(new Go2rtcExitedError(code, signal));
    });
    child.once('error', reject);
    createInterface({ input: child.stdout }).on('line', (text) => {
      if (relay(launch, text)) {
        resolve();
      }
    });
  });
}

function watchExit(child: Go2rtcChild, launch: Go2rtcLaunch, stopping: () => boolean): void {
  child.once('exit', (code, signal) => {
    launch.log.info('go2rtc.exited', {
      pid: child.pid,
      exitCode: code,
      signal,
      expected: stopping(),
    });
    setTimeout(() => {
      if (!stopping()) {
        launch.log.error('go2rtc.died', new Go2rtcExitedError(code, signal), { pid: child.pid });
        launch.exited(new Go2rtcExitedError(code, signal));
      }
    }, SHUTDOWN_GRACE_MS);
  });
}

function reportStarted(launch: Go2rtcLaunch, child: Go2rtcChild, startedAt: number): void {
  launch.log.info('go2rtc.started', {
    apiPort: launch.apiPort,
    rtspPort: launch.rtspPort,
    webrtcPort: launch.webrtcPort,
    pid: child.pid,
    candidates: launch.candidates.length,
    iceServers: launch.iceServers.length,
    xiaomiLogins: Object.keys(launch.xiaomi).length,
    durationMs: Date.now() - startedAt,
  });
}

export async function startGo2rtc(launch: Go2rtcLaunch): Promise<RunningGo2rtc> {
  const directory = join(launch.dataDirectory, 'go2rtc');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const configPath = join(directory, 'go2rtc.yaml');
  await writeFile(
    configPath,
    go2rtcConfig({ ...launch, username: GO2RTC_USERNAME, ffmpegBinary: ffmpegPath() }),
    {
      mode: 0o600,
    },
  );
  const child = spawn(launch.binary, ['-config', configPath], {
    cwd: directory,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stopping = false;
  const startedAt = Date.now();
  launch.log.debug('go2rtc.spawned', { pid: child.pid, binary: launch.binary });
  child.stderr.on('data', (chunk: Buffer) => {
    launch.log.warn('go2rtc.stderr', { text: withoutQueries(chunk.toString('utf8')) });
  });
  await awaitReady(child, launch);
  watchExit(child, launch, () => stopping);
  reportStarted(launch, child, startedAt);
  return {
    baseUrl: `http://127.0.0.1:${String(launch.apiPort)}`,
    username: GO2RTC_USERNAME,
    password: launch.password,
    stop: () =>
      new Promise((resolve) => {
        stopping = true;
        launch.log.info('go2rtc.stopping', { pid: child.pid });
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve();
          return;
        }
        child.once('exit', () => {
          resolve();
        });
        child.kill('SIGTERM');
      }),
  };
}
