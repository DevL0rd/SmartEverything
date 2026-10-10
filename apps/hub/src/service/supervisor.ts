import type { WriteStream } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import {
  RESTART_EXIT_CODE,
  RESTART_REQUEST_FILE,
  SERVICE_OUTPUT_LOG_FILE,
  SERVICE_READY_FILE,
  STOP_REQUEST_FILE,
  SUPERVISOR_PID_FILE,
} from './configuration';
import { openAppendStream, watchRequest, writePidFile, type PidFile } from './files';

export interface ServiceChild {
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly kill: () => void;
  readonly onExit: (listener: (code: number | null, signal: string | null) => void) => void;
  readonly onError: (listener: (cause: Error) => void) => void;
}

export interface SupervisorHost {
  readonly dataDirectory: string;
  readonly pid: number;
  readonly spawnService: () => ServiceChild;
  readonly isAlive: (processId: number) => boolean;
  readonly exit: (code: number) => void;
  readonly later: (run: () => void, delayMs: number) => () => void;
  readonly retryMs: number;
  readonly stopGraceMs: number;
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

export async function supervisorHolder(dataDirectory: string): Promise<number | null> {
  try {
    const holder = Number.parseInt(
      await readFile(join(dataDirectory, SUPERVISOR_PID_FILE), 'utf8'),
    );
    return Number.isInteger(holder) && holder > 0 ? holder : null;
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

function note(output: WriteStream, event: string, payload: Record<string, unknown>): void {
  output.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), scope: 'hub.supervisor', event, payload })}\n`,
  );
}

class Supervision {
  private child: ServiceChild | null = null;
  private stopping = false;
  private cancelTimer: (() => void) | null = null;
  private finished = false;
  stopWatch: { readonly stop: () => void } | null = null;

  constructor(
    private readonly host: SupervisorHost,
    private readonly output: WriteStream,
    private readonly pidFile: PidFile,
  ) {}

  run(): void {
    this.cancelTimer = null;
    const child = this.host.spawnService();
    this.child = child;
    child.stdout.pipe(this.output, { end: false });
    child.stderr.pipe(this.output, { end: false });
    note(this.output, 'supervisor.service_started', {});
    child.onError((cause) => {
      note(this.output, 'supervisor.spawn_failed', { message: cause.message });
    });
    child.onExit((code, signal) => {
      void this.exited(code, signal);
    });
  }

  requestStop(): void {
    this.stopping = true;
    note(this.output, 'supervisor.stop_requested', {});
    this.cancelTimer?.();
    const child = this.child;
    if (child === null) {
      void this.finish();
      return;
    }
    writeFile(join(this.host.dataDirectory, RESTART_REQUEST_FILE), 'stop', { mode: 0o600 }).catch(
      (cause: unknown) => {
        note(this.output, 'supervisor.stop_request_failed', { message: String(cause) });
        child.kill();
      },
    );
    this.host.later(() => {
      if (this.child === child) {
        note(this.output, 'supervisor.stop_forced', {});
        child.kill();
      }
    }, this.host.stopGraceMs);
  }

  private async exited(code: number | null, signal: string | null): Promise<void> {
    this.child = null;
    await rm(join(this.host.dataDirectory, SERVICE_READY_FILE), { force: true });
    note(this.output, 'supervisor.service_exited', { code, signal });
    if (this.stopping || code === 0) {
      await this.finish();
      return;
    }
    if (code === RESTART_EXIT_CODE) {
      this.run();
      return;
    }
    this.cancelTimer = this.host.later(() => {
      this.run();
    }, this.host.retryMs);
  }

  private async finish(): Promise<void> {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.stopWatch?.stop();
    await rm(join(this.host.dataDirectory, STOP_REQUEST_FILE), { force: true });
    await rm(join(this.host.dataDirectory, RESTART_REQUEST_FILE), { force: true });
    await this.pidFile.remove();
    note(this.output, 'supervisor.stopped', {});
    await new Promise<void>((resolve) => {
      this.output.end(resolve);
    });
    this.host.exit(0);
  }
}

export async function runSupervisor(host: SupervisorHost): Promise<void> {
  const output = await openAppendStream(join(host.dataDirectory, SERVICE_OUTPUT_LOG_FILE));
  const holder = await supervisorHolder(host.dataDirectory);
  if (holder !== null && holder !== host.pid && host.isAlive(holder)) {
    note(output, 'supervisor.already_running', { holder });
    await new Promise<void>((resolve) => {
      output.end(resolve);
    });
    host.exit(0);
    return;
  }
  const pidFile = await writePidFile(host.dataDirectory, host.pid, SUPERVISOR_PID_FILE);
  const supervision = new Supervision(host, output, pidFile);
  supervision.stopWatch = await watchRequest(host.dataDirectory, STOP_REQUEST_FILE, {
    requested: () => {
      supervision.requestStop();
    },
    failed: (cause) => {
      note(output, 'supervisor.stop_watch_failed', { message: String(cause) });
    },
  });
  supervision.run();
}
