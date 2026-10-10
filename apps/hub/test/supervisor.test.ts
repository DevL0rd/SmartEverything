import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RESTART_EXIT_CODE,
  RESTART_REQUEST_FILE,
  SERVICE_OUTPUT_LOG_FILE,
  SERVICE_READY_FILE,
  STOP_REQUEST_FILE,
  SUPERVISOR_PID_FILE,
} from '../src/service/configuration';
import {
  runSupervisor,
  supervisorHolder,
  type ServiceChild,
  type SupervisorHost,
} from '../src/service/supervisor';
import { temporaryDirectory } from './support/server';

let directory: { path: string; remove: () => Promise<void> };

beforeEach(async () => {
  directory = await temporaryDirectory();
});

afterEach(async () => {
  await directory.remove();
});

interface FakeChild extends ServiceChild {
  readonly stdoutStream: PassThrough;
  readonly killed: () => boolean;
  readonly exit: (code: number | null) => void;
}

function fakeChild(): FakeChild {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let exitListener: (code: number | null, signal: string | null) => void = () => undefined;
  let killed = false;
  return {
    stdout,
    stderr,
    stdoutStream: stdout,
    kill: (): void => {
      killed = true;
    },
    killed: () => killed,
    onExit: (listener): void => {
      exitListener = listener;
    },
    onError: (): void => undefined,
    exit: (code): void => {
      exitListener(code, null);
    },
  };
}

interface Harness {
  readonly host: SupervisorHost;
  readonly children: FakeChild[];
  readonly timers: { run: () => void; delayMs: number; cancelled: boolean }[];
  readonly exited: Promise<number>;
  readonly spawned: (count: number) => Promise<void>;
}

function harness(alive: (processId: number) => boolean = () => false): Harness {
  const children: FakeChild[] = [];
  const timers: Harness['timers'] = [];
  const waiting: { count: number; resolve: () => void }[] = [];
  let exit: (code: number) => void = () => undefined;
  const exited = new Promise<number>((resolve) => {
    exit = resolve;
  });
  return {
    children,
    timers,
    exited,
    spawned: (count) =>
      children.length >= count
        ? Promise.resolve()
        : new Promise((resolve) => {
            waiting.push({ count, resolve });
          }),
    host: {
      dataDirectory: directory.path,
      pid: 4242,
      spawnService: (): ServiceChild => {
        const child = fakeChild();
        children.push(child);
        waiting
          .filter((wait) => wait.count <= children.length)
          .forEach((wait) => {
            wait.resolve();
          });
        return child;
      },
      isAlive: alive,
      exit,
      later: (run, delayMs) => {
        const timer = { run, delayMs, cancelled: false };
        timers.push(timer);
        return (): void => {
          timer.cancelled = true;
        };
      },
      retryMs: 5000,
      stopGraceMs: 30_000,
    },
  };
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe('runSupervisor', () => {
  it('records its pid, keeps the output, starts it again at once on a restart and after a delay on a crash', async () => {
    const run = harness();
    await runSupervisor(run.host);
    expect(await supervisorHolder(directory.path)).toBe(4242);
    run.children[0]?.stdoutStream.write('booting\n');
    await writeFile(join(directory.path, SERVICE_READY_FILE), '{}');
    run.children[0]?.exit(RESTART_EXIT_CODE);
    await run.spawned(2);
    expect(await exists(join(directory.path, SERVICE_READY_FILE))).toBe(false);
    run.children[1]?.exit(1);
    await settle();
    expect(run.children).toHaveLength(2);
    expect(run.timers.map((timer) => timer.delayMs)).toStrictEqual([5000]);
    run.timers[0]?.run();
    expect(run.children).toHaveLength(3);
    run.children[2]?.exit(0);
    expect(await run.exited).toBe(0);
    expect(await exists(join(directory.path, SUPERVISOR_PID_FILE))).toBe(false);
    const output = await readFile(join(directory.path, SERVICE_OUTPUT_LOG_FILE), 'utf8');
    expect(output).toContain('booting');
    expect(output).toContain('"event":"supervisor.service_exited"');
  });

  it('stops the service through its restart request when a stop is requested, forcing it after the grace period', async () => {
    const run = harness();
    await runSupervisor(run.host);
    await writeFile(join(directory.path, STOP_REQUEST_FILE), 'stop');
    await settle();
    expect(await readFile(join(directory.path, RESTART_REQUEST_FILE), 'utf8')).toBe('stop');
    const grace = run.timers.at(-1);
    expect(grace?.delayMs).toBe(30_000);
    grace?.run();
    expect(run.children[0]?.killed()).toBe(true);
    run.children[0]?.exit(RESTART_EXIT_CODE);
    expect(await run.exited).toBe(0);
    expect(run.children).toHaveLength(1);
    expect(await exists(join(directory.path, STOP_REQUEST_FILE))).toBe(false);
    expect(await exists(join(directory.path, RESTART_REQUEST_FILE))).toBe(false);
  });

  it('stops at once when a stop arrives while it waits to retry', async () => {
    const run = harness();
    await runSupervisor(run.host);
    run.children[0]?.exit(1);
    await settle();
    await writeFile(join(directory.path, STOP_REQUEST_FILE), 'stop');
    expect(await run.exited).toBe(0);
    expect(run.timers[0]?.cancelled).toBe(true);
  });

  it('leaves a running supervisor alone and replaces the pid of one that is gone', async () => {
    await writeFile(join(directory.path, SUPERVISOR_PID_FILE), '777\n');
    const blocked = harness((processId) => processId === 777);
    await runSupervisor(blocked.host);
    expect(await blocked.exited).toBe(0);
    expect(blocked.children).toHaveLength(0);
    expect(await supervisorHolder(directory.path)).toBe(777);
    const replacing = harness();
    await runSupervisor(replacing.host);
    expect(await supervisorHolder(directory.path)).toBe(4242);
    replacing.children[0]?.exit(0);
    expect(await replacing.exited).toBe(0);
    expect(await supervisorHolder(directory.path)).toBeNull();
  });
});
