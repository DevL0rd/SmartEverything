import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { ControlLine, HelperPort } from './placements.js';

export interface HelperRouteLine {
  readonly op: 'route';
  readonly url?: string;
  readonly server?: string;
  readonly pin?: string;
}

export interface HelperCacheLine {
  readonly op: 'cache';
  readonly maxAgeSeconds: number;
  readonly maxBytes?: number;
  readonly minFreeBytes?: number;
  readonly cleanupSeconds: number;
}

export type HelperSetting = HelperRouteLine | HelperCacheLine;

export type HelperLine =
  | ControlLine
  | HelperSetting
  | { readonly op: 'pin' | 'unpin'; readonly mount: string; readonly path: string };

export interface HelperChild {
  readonly writeControl: (line: string) => void;
  readonly endControl: () => void;
  readonly sendToken: (token: string) => Promise<void>;
  readonly onStdout: (listener: (line: string) => void) => void;
  readonly onStderr: (listener: (line: string) => void) => void;
  readonly onExit: (listener: (reason: string) => void) => void;
  readonly kill: () => void;
}

export type SpawnHelper = (file: string, args: readonly string[]) => HelperChild;

export interface HelperLaunch {
  readonly binary: string;
  readonly cacheDirectory: string;
  readonly token: () => Promise<string>;
  readonly spawn: SpawnHelper;
}

export class HelperTokenPipeError extends Error {
  override readonly name = 'HelperTokenPipeError';

  constructor() {
    super('The mount helper was started without its private token pipe');
  }
}

const TOKEN_PIPE = 3;

function exitReason(code: number | null, signal: string | null): string {
  if (signal !== null) return `The mount helper stopped (${signal})`;
  return `The mount helper stopped (exit code ${String(code)})`;
}

export const nodeSpawnHelper: SpawnHelper = (file, args) => {
  const child = spawn(file, [...args], {
    stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const pipe = child.stdio[TOKEN_PIPE];
  child.stdin.on('error', () => undefined);
  const wrapped: HelperChild = {
    writeControl: (line) => {
      child.stdin.write(`${line}\n`);
    },
    endControl: () => {
      child.stdin.end();
    },
    sendToken: (token) =>
      new Promise((resolve, reject) => {
        if (!(pipe instanceof Writable)) {
          reject(new HelperTokenPipeError());
          return;
        }
        pipe.once('error', reject);
        pipe.end(`${token}\n`, resolve);
      }),
    onStdout: (listener) => {
      createInterface({ input: child.stdout }).on('line', listener);
    },
    onStderr: (listener) => {
      createInterface({ input: child.stderr }).on('line', listener);
    },
    onExit: (listener) => {
      child.once('error', (cause) => {
        listener(`The mount helper could not start: ${cause.message}`);
      });
      child.once('exit', (code, signal) => {
        listener(exitReason(code, signal));
      });
    },
    kill: () => {
      child.kill('SIGTERM');
    },
  };
  return wrapped;
};

interface Running {
  readonly child: HelperChild;
  readonly exited: Promise<void>;
}

export class HelperProcess implements HelperPort {
  private readonly listeners = new Set<(raw: string) => void>();
  private readonly mounts = new Set<string>();
  private readonly settings = new Map<HelperSetting['op'], HelperSetting>();
  private current: Running | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly launch: HelperLaunch,
    private readonly log: Logger,
  ) {}

  send(line: HelperLine): void {
    this.queue = this.queue.then(() => this.deliver(line));
  }

  configure(setting: HelperSetting): void {
    this.settings.set(setting.op, setting);
    this.current?.child.writeControl(JSON.stringify(setting));
  }

  onLine(listener: (raw: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    await this.queue;
    const { current } = this;
    this.current = null;
    this.mounts.clear();
    if (current === null) return;
    current.child.endControl();
    await current.exited;
  }

  private async deliver(line: HelperLine): Promise<void> {
    try {
      const running = await this.running();
      running.child.writeControl(JSON.stringify(line));
      if (line.op === 'mount') this.mounts.add(line.mount);
      if (line.op === 'unmount') this.mounts.delete(line.mount);
    } catch (cause) {
      this.log.error('drive_mount.helper_send_failed', cause, { op: line.op });
      if ('mount' in line) {
        this.fail(line.mount, `The mount helper is not available: ${messageOf(cause)}`);
      }
    }
  }

  private async running(): Promise<Running> {
    if (this.current !== null) return this.current;
    const token = await this.launch.token();
    const child = this.launch.spawn(this.launch.binary, ['-cache', this.launch.cacheDirectory]);
    const running = this.adopt(child);
    try {
      await child.sendToken(token);
    } catch (cause) {
      child.kill();
      throw cause;
    }
    for (const setting of this.settings.values()) child.writeControl(JSON.stringify(setting));
    this.current = running;
    return running;
  }

  private adopt(child: HelperChild): Running {
    let finish = (): void => undefined;
    const exited = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const running: Running = { child, exited };
    child.onStdout((raw) => {
      for (const listener of this.listeners) listener(raw);
    });
    child.onStderr((raw) => {
      this.log.warn('drive_mount.helper_stderr', { line: raw });
    });
    child.onExit((reason) => {
      if (this.current === running) {
        this.current = null;
        this.failAll(reason);
      }
      finish();
    });
    return running;
  }

  private failAll(reason: string): void {
    this.log.warn('drive_mount.helper_exited', { reason, mounts: this.mounts.size });
    for (const mount of [...this.mounts]) this.fail(mount, reason);
    this.mounts.clear();
  }

  private fail(mount: string, reason: string): void {
    const raw = JSON.stringify({ type: 'status', mount, state: 'failed', reason });
    for (const listener of this.listeners) listener(raw);
  }
}
