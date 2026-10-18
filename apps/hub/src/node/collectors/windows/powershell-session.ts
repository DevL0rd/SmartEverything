import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { z } from 'zod';

const REQUEST_TIMEOUT_MS = 20_000;
const OK_PREFIX = 'SE-OK ';
const ERROR_PREFIX = 'SE-ERR ';
const END_LINE = 'SE-END';
const SETUP =
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $ProgressPreference = "SilentlyContinue"; $ErrorActionPreference = "Stop"';

export class PowerShellFailedError extends Error {
  override readonly name = 'PowerShellFailedError';

  constructor(
    readonly script: string,
    reason: string,
  ) {
    super(`PowerShell could not run ${script.slice(0, 80)}: ${reason}`);
  }
}

export interface ShellProcess {
  readonly write: (text: string) => void;
  readonly onLine: (listener: (line: string) => void) => void;
  readonly onExit: (listener: (reason: string) => void) => void;
  readonly kill: () => void;
}

export type SpawnShell = () => ShellProcess;

export const spawnPowerShell: SpawnShell = () => {
  const child = spawn(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  child.stderr.resume();
  return {
    write: (text): void => {
      child.stdin.write(text);
    },
    onLine: (listener): void => {
      createInterface({ input: child.stdout }).on('line', listener);
    },
    onExit: (listener): void => {
      child.once('error', (cause) => {
        listener(cause.message);
      });
      child.once('exit', (code, signal) => {
        listener(`exited with ${code === null ? String(signal) : String(code)}`);
      });
    },
    kill: (): void => {
      child.kill();
    },
  };
};

interface Pending {
  readonly script: string;
  readonly resolve: (json: unknown) => void;
  readonly reject: (cause: unknown) => void;
  result: string | null;
  failure: string | null;
}

function wrapped(script: string): string {
  return `try { $se = & { ${script} }; 'SE-OK ' + (ConvertTo-Json -InputObject $se -Compress -Depth 6) } catch { 'SE-ERR ' + (($_.Exception.Message) -replace '\\r?\\n', ' ') }; 'SE-END'\n`;
}

export interface PowerShell {
  readonly run: <T>(script: string, schema: z.ZodType<T>) => Promise<T>;
  readonly stop: () => void;
}

export class PowerShellSession implements PowerShell {
  private shell: ShellProcess | null = null;
  private current: Pending | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly queue: Pending[] = [];

  constructor(private readonly spawnShell: SpawnShell = spawnPowerShell) {}

  run<T>(script: string, schema: z.ZodType<T>): Promise<T> {
    return new Promise<unknown>((resolve, reject) => {
      this.queue.push({ script, resolve, reject, result: null, failure: null });
      this.next();
    }).then((json) => {
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new PowerShellFailedError(
          script,
          `answered something unexpected: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    });
  }

  stop(): void {
    this.drop('the session was stopped');
  }

  private next(): void {
    if (this.current !== null) return;
    const pending = this.queue.shift();
    if (pending === undefined) return;
    this.current = pending;
    this.timer = setTimeout(() => {
      this.drop(`it did not answer within ${String(REQUEST_TIMEOUT_MS)} ms`);
    }, REQUEST_TIMEOUT_MS);
    this.session().write(wrapped(pending.script));
  }

  private session(): ShellProcess {
    if (this.shell !== null) return this.shell;
    const shell = this.spawnShell();
    shell.onLine((line) => {
      this.line(line);
    });
    shell.onExit((reason) => {
      if (this.shell === shell) this.drop(reason);
    });
    shell.write(`${SETUP}\n`);
    this.shell = shell;
    return shell;
  }

  private line(line: string): void {
    const pending = this.current;
    if (pending === null) return;
    if (line.startsWith(OK_PREFIX)) pending.result = line.slice(OK_PREFIX.length);
    else if (line.startsWith(ERROR_PREFIX)) pending.failure = line.slice(ERROR_PREFIX.length);
    else if (line === END_LINE) this.finish(pending);
  }

  private finish(pending: Pending): void {
    this.current = null;
    this.clear();
    if (pending.failure !== null) {
      pending.reject(new PowerShellFailedError(pending.script, pending.failure));
    } else if (pending.result === null) {
      pending.reject(new PowerShellFailedError(pending.script, 'it printed no answer'));
    } else {
      this.settle(pending, pending.result);
    }
    this.next();
  }

  private settle(pending: Pending, text: string): void {
    try {
      pending.resolve(JSON.parse(text));
    } catch (cause) {
      pending.reject(
        new PowerShellFailedError(pending.script, `its answer was not JSON: ${String(cause)}`),
      );
    }
  }

  private drop(reason: string): void {
    const shell = this.shell;
    this.shell = null;
    this.clear();
    shell?.kill();
    const waiting = [...(this.current === null ? [] : [this.current]), ...this.queue.splice(0)];
    this.current = null;
    for (const pending of waiting) {
      pending.reject(new PowerShellFailedError(pending.script, reason));
    }
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const windowsShell = new PowerShellSession();
