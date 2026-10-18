import dbus from 'dbus-next';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusCall, MethodHandler } from '../../../src/node/controls/linux/dbus-session';
import { KdeBridge, type BridgeBus } from '../../../src/node/controls/linux/kde-bridge';

const REQUEST = /"([0-9a-f-]{36})"/;

type Served = Record<string, MethodHandler>;

function fakeDesktop(
  pids: readonly number[],
  calls: string[] = [],
  owned = true,
  served: Served = {},
): BridgeBus {
  return {
    own: () => (owned ? Promise.resolve() : Promise.reject(new Error('name taken'))),
    serve: (_target, handlers) => {
      Object.assign(served, handlers);
      return () => undefined;
    },
    call: async (call: BusCall): Promise<readonly unknown[]> => {
      calls.push(`${call.member} ${JSON.stringify(call.body ?? [])}`);
      if (call.member === 'loadScript') {
        const [path] = call.body ?? [];
        const source = await readFile(String(path), 'utf8');
        const request = REQUEST.exec(source)?.[1];
        if (request !== undefined && source.includes("'Windows'")) {
          setTimeout(() => {
            served['Windows']?.([request, pids.map((pid) => new dbus.Variant('i', pid))]);
          }, 0);
        }
        return [1];
      }
      return [];
    },
  };
}

describe('KWin window scripts', () => {
  let runtime = '';

  beforeEach(async () => {
    runtime = await mkdtemp(join(tmpdir(), 'kde-bridge-'));
    vi.stubEnv('XDG_RUNTIME_DIR', runtime);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(runtime, { recursive: true, force: true });
  });

  it('reads the program ids KWin sends back as variants', async () => {
    const bridge = new KdeBridge(fakeDesktop([4242]), () => undefined);
    await bridge.start();
    await expect(bridge.actOnWindow('{window}', 'minimise')).resolves.toBe(true);
    await expect(bridge.windowsOf('org.kde.calculator', false)).resolves.toEqual([4242]);
  });

  it('answers false when KWin finds no such window', async () => {
    const bridge = new KdeBridge(fakeDesktop([]), () => undefined);
    await bridge.start();
    await expect(bridge.actOnWindow('{gone}', 'focus')).resolves.toBe(false);
  });

  it('leaves the desktop scripts of another SmartEverything alone when it could not start', async () => {
    const calls: string[] = [];
    const bridge = new KdeBridge(fakeDesktop([], calls, false), () => undefined);
    await expect(bridge.start()).rejects.toThrow('name taken');
    await bridge.stop();
    expect(calls).toEqual([]);
  });

  it('lists the windows its watch script pushed without loading another script', async () => {
    const calls: string[] = [];
    const served: Served = {};
    const bridge = new KdeBridge(fakeDesktop([], calls, true, served), () => undefined);
    await bridge.start();
    const changes: number[] = [];
    const stop = await bridge.watchWindows(
      () => changes.push(1),
      () => undefined,
    );
    const loaded = calls.filter((call) => call.startsWith('loadScript')).length;
    const row = {
      id: '{a}',
      title: 'Terminal',
      desktopFile: 'org.kde.konsole',
      resourceClass: 'konsole',
      minimized: false,
      active: true,
      desktops: ['Desktop 1'],
    };
    served['WindowsChanged']?.([JSON.stringify([row])]);
    await expect(bridge.listWindows()).resolves.toEqual([row]);
    expect(changes).toEqual([1]);
    expect(calls.filter((call) => call.startsWith('loadScript'))).toHaveLength(loaded);
    stop();
  });

  it('unloads its own scripts when it stops', async () => {
    const calls: string[] = [];
    const bridge = new KdeBridge(fakeDesktop([], calls), () => undefined);
    await bridge.start();
    await bridge.stop();
    expect(calls).toContain('unloadScript ["smarteverything-focus"]');
  });
});
