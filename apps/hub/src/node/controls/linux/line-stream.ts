import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

const RESTART_MS = 5000;

export interface LineStream {
  readonly program: string;
  readonly args: readonly string[];
  readonly onLine: (line: string) => void;
  readonly onFailure: (cause: unknown) => void;
}

export type StopStream = () => void;

export type LineSubscriber = (stream: LineStream) => StopStream;

export const spawnLines: LineSubscriber = (stream) => {
  let stopped = false;
  let restart: NodeJS.Timeout | null = null;
  let current: ChildProcessByStdio<null, Readable, null> | null = null;

  const start = (): void => {
    const child = spawn(stream.program, [...stream.args], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    current = child;
    createInterface({ input: child.stdout }).on('line', stream.onLine);
    child.once('error', stream.onFailure);
    child.once('exit', () => {
      current = null;
      if (!stopped) {
        restart = setTimeout(start, RESTART_MS);
      }
    });
  };

  start();
  return (): void => {
    stopped = true;
    if (restart !== null) {
      clearTimeout(restart);
    }
    current?.kill();
  };
};
