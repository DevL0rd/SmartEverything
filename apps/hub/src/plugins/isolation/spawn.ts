import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import { env, execPath, versions } from 'node:process';
import { FRAME, ChildUnavailableError, type Frame } from './frames';

export interface ChildHandle {
  readonly pid: number | undefined;
  readonly send: (frame: Frame) => boolean;
  readonly kill: () => void;
  readonly onFrame: (listener: (frame: Frame) => void) => void;
  readonly onInvalid: (listener: (error: Error) => void) => void;
  readonly onExit: (listener: (code: number | null, signal: string | null) => void) => void;
}

export type ChildSpawner = () => ChildHandle;

export interface ForkOptions {
  readonly kind: string;
  readonly entry: string;
  readonly execArgv?: readonly string[];
}

export function forkChild(options: ForkOptions): ChildSpawner {
  const { kind, entry, execArgv = [] } = options;
  return (): ChildHandle => {
    if (!existsSync(entry)) {
      throw new ChildUnavailableError(kind, `its program is missing (${entry})`);
    }
    const child = fork(entry, [], {
      execPath,
      execArgv: [...execArgv],
      serialization: 'advanced',
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: versions['electron'] === undefined ? env : { ...env, ELECTRON_RUN_AS_NODE: '1' },
    });
    const invalid: ((error: Error) => void)[] = [];
    child.on('error', () => undefined);
    return {
      pid: child.pid,
      send: (frame): boolean => child.connected && child.send(frame),
      kill: (): void => {
        child.kill('SIGKILL');
      },
      onFrame: (listener): void => {
        child.on('message', (raw) => {
          const parsed = FRAME.safeParse(raw);
          if (parsed.success) {
            listener(parsed.data);
          } else {
            invalid.forEach((handler) => {
              handler(parsed.error);
            });
          }
        });
      },
      onInvalid: (listener): void => {
        invalid.push(listener);
      },
      onExit: (listener): void => {
        child.once('exit', listener);
      },
    };
  };
}
