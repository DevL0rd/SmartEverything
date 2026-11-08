import { readFile, stat, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pidHolder } from '../src/pid-lock';
import { nodeLayout } from '../src/data-layout';
import { RESTART_EXIT_CODE } from '../src/service/configuration';
import { runSupervisor, type ServiceChild, type SupervisorHost } from '../src/service/supervisor';
import { temporaryDirectory } from './support/server';
import { until } from './support/wait';

let directory: { path: string; remove: () => Promise<void> };

function files(): SupervisorHost['files'] {
  const node = nodeLayout(directory.path);
  return {
    supervisorPid: node.supervisorPid,
    restartRequest: node.restartRequest,
    stopRequest: node.stopRequest,
    ready: node.ready,
    output: node.logs.serviceOutput,
  };
}

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
      files: files(),
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

describe('runSupervisor', () => {
  it('records its pid, keeps the output, starts it again at once on a restart and after a delay on a crash', async () => {
    const run = harness();
    await runSupervisor(run.host);
    expect(await pidHolder(files().supervisorPid)).toBe(4242);
    run.children[0]?.stdoutStream.write('booting\n');
    await writeFile(files().ready, '{}');
    run.children[0]?.exit(RESTART_EXIT_CODE);
    await run.spawned(2);
    expect(await exists(files().ready)).toBe(false);
    run.children[1]?.exit(1);
    await until(() => run.timers.length === 1, 'the retry timer');
    expect(run.children).toHaveLength(2);
    expect(run.timers.map((timer) => timer.delayMs)).toStrictEqual([5000]);
    run.timers[0]?.run();
    expect(run.children).toHaveLength(3);
    run.children[2]?.exit(0);
    expect(await run.exited).toBe(0);
    expect(await exists(files().supervisorPid)).toBe(false);
    const output = await readFile(files().output, 'utf8');
    expect(output).toContain('booting');
    expect(output).toContain('"event":"supervisor.service_exited"');
  });

  it('stops the service through its restart request when a stop is requested, forcing it after the grace period', async () => {
    const run = harness();
    await runSupervisor(run.host);
    await writeFile(files().stopRequest, 'stop');
    await until(() => exists(files().restartRequest), 'the restart request');
    expect(await readFile(files().restartRequest, 'utf8')).toBe('stop');
    const grace = run.timers.at(-1);
    expect(grace?.delayMs).toBe(30_000);
    grace?.run();
    expect(run.children[0]?.killed()).toBe(true);
    run.children[0]?.exit(RESTART_EXIT_CODE);
    expect(await run.exited).toBe(0);
    expect(run.children).toHaveLength(1);
    expect(await exists(files().stopRequest)).toBe(false);
    expect(await exists(files().restartRequest)).toBe(false);
  });

  it('stops at once when a stop arrives while it waits to retry', async () => {
    const run = harness();
    await runSupervisor(run.host);
    run.children[0]?.exit(1);
    await until(() => run.timers.length === 1, 'the retry timer');
    await writeFile(files().stopRequest, 'stop');
    expect(await run.exited).toBe(0);
    expect(run.timers[0]?.cancelled).toBe(true);
  });

  it('leaves a running supervisor alone and replaces the pid of one that is gone', async () => {
    await writeFile(files().supervisorPid, '777\n');
    const blocked = harness((processId) => processId === 777);
    await runSupervisor(blocked.host);
    expect(await blocked.exited).toBe(0);
    expect(blocked.children).toHaveLength(0);
    expect(await pidHolder(files().supervisorPid)).toBe(777);
    const replacing = harness();
    await runSupervisor(replacing.host);
    expect(await pidHolder(files().supervisorPid)).toBe(4242);
    replacing.children[0]?.exit(0);
    expect(await replacing.exited).toBe(0);
    expect(await pidHolder(files().supervisorPid)).toBeNull();
  });
});
