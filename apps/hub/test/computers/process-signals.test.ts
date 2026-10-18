import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import type { KdeBridge } from '../../src/node/controls/linux/kde-bridge';
import { LinuxApps } from '../../src/node/controls/linux/linux-apps';
import { DesktopEntries } from '../../src/node/controls/linux/desktop-entries';
import { LinuxProcesses } from '../../src/node/controls/linux/linux-processes';

const children: ChildProcess[] = [];

function sleeper(): ChildProcess {
  const child = spawn('sleep', ['60'], { stdio: 'ignore' });
  children.push(child);
  return child;
}

function ended(child: ChildProcess): Promise<unknown> {
  return once(child, 'exit');
}

function failureOf(work: () => void): unknown {
  try {
    work();
  } catch (cause) {
    return cause;
  }
  return null;
}

function processes(): LinuxProcesses {
  return new LinuxProcesses();
}

afterEach(() => {
  children.splice(0).forEach((child) => child.kill('SIGKILL'));
});

describe.skipIf(process.platform !== 'linux')('process signals', () => {
  it('ends a program of the same user through the operating system', async () => {
    const child = sleeper();
    const exit = ended(child);
    processes().signal(child.pid ?? 0, 'end');
    await expect(exit).resolves.toEqual([null, 'SIGTERM']);
  });

  it.skipIf(process.getuid?.() === 0)(
    'answers not_own when the operating system refuses a program of another user',
    () => {
      expect(
        failureOf(() => {
          processes().signal(1, 'end');
        }),
      ).toMatchObject({ code: 'not_own' });
    },
  );

  it('answers not_found for a program that already closed', async () => {
    const child = sleeper();
    const exit = ended(child);
    child.kill('SIGKILL');
    await exit;
    expect(
      failureOf(() => {
        processes().signal(child.pid ?? 0, 'force');
      }),
    ).toMatchObject({
      code: 'not_found',
    });
  });

  it('refuses to end the hub itself', () => {
    expect(
      failureOf(() => {
        processes().signal(process.pid, 'end');
      }),
    ).toMatchObject({
      code: 'not_own',
    });
  });

  it('force-closing an app kills every window program, even one that is already gone', async () => {
    const live = sleeper();
    const gone = sleeper();
    const exits = [ended(live), ended(gone)];
    gone.kill('SIGKILL');
    await exits[1];
    const apps = new LinuxApps(
      new DesktopEntries(),
      (): Pick<KdeBridge, 'windowsOf'> => ({
        windowsOf: () => Promise.resolve([gone.pid ?? 0, live.pid ?? 0]),
      }),
      () => Promise.resolve(''),
    );
    await expect(apps.close('any', true)).resolves.toBe(2);
    await expect(exits[0]).resolves.toEqual([null, 'SIGKILL']);
  });
});

describe.skipIf(process.platform !== 'linux')('process pages', () => {
  it('pages the list by cursor and ends with no next page', async () => {
    const control = processes();
    try {
      const first = await control.list({ sort: 'cpu', limit: 1, cursor: 0 });
      expect(first.processes).toHaveLength(1);
      expect(first.next).toBe(1);
      const past = await control.list({ sort: 'cpu', limit: 50, cursor: 1_000_000 });
      expect(past).toMatchObject({ processes: [], next: null });
    } finally {
      control.stop();
    }
  });
});
