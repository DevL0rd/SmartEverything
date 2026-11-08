import { describe, expect, it } from 'vitest';
import type { SignalListener } from '../../../src/node/controls/linux/dbus-session';
import {
  UserManagerEnvironment,
  type ManagerBus,
  type ProcessVariables,
} from '../../../src/node/controls/linux/user-manager-environment';
import { BOTH, displayRig } from './display-rig';
import { settle } from './support';

const NO_SESSION: readonly string[] = ['HOME=/home/test', 'XDG_RUNTIME_DIR=/run/user/1000'];
const SESSION: readonly string[] = [
  ...NO_SESSION,
  'WAYLAND_DISPLAY=wayland-1',
  'DISPLAY=:0',
  'XDG_CURRENT_DESKTOP=KDE',
];

interface Manager {
  readonly environment: UserManagerEnvironment;
  readonly target: ProcessVariables;
  readonly setEnvironment: (lines: readonly string[]) => void;
  readonly finishJob: (unit: string) => void;
  readonly subscribed: () => boolean;
  readonly closed: () => boolean;
}

function manager(initial: readonly string[], target: ProcessVariables = {}): Manager {
  let lines = initial;
  let listener: SignalListener = () => undefined;
  let subscribed = false;
  let closed = false;
  const bus: ManagerBus = {
    call: (request) => {
      if (request.member === 'Subscribe') {
        subscribed = true;
        return Promise.resolve([]);
      }
      return Promise.resolve([{ signature: 'as', value: lines }]);
    },
    watch: (_rule, next) => {
      listener = next;
      return Promise.resolve(() => undefined);
    },
    close: () => {
      closed = true;
    },
  };
  const environment = new UserManagerEnvironment({
    open: (): Promise<ManagerBus> => Promise.resolve(bus),
    target,
    failed: (cause): never => {
      throw cause instanceof Error ? cause : new Error(String(cause));
    },
  });
  return {
    environment,
    target,
    setEnvironment: (next): void => {
      lines = next;
    },
    finishJob: (unit): void => {
      listener([1, '/job/1', unit, 'done'], 'org.freedesktop.systemd1');
    },
    subscribed: (): boolean => subscribed,
    closed: (): boolean => closed,
  };
}

async function started(
  initial: readonly string[],
  target: ProcessVariables = {},
): Promise<Manager> {
  const test = manager(initial, target);
  await test.environment.start(() => undefined);
  return test;
}

describe('the session variables the node learns from the systemd user manager', () => {
  it('applies the session variables that are there when the node starts', async () => {
    const test = await started(SESSION);
    expect(test.subscribed()).toBe(true);
    expect(test.target).toEqual({
      WAYLAND_DISPLAY: 'wayland-1',
      DISPLAY: ':0',
      XDG_CURRENT_DESKTOP: 'KDE',
    });
  });

  it('does not copy variables that are not session variables', async () => {
    const test = await started(SESSION);
    expect(test.target).not.toHaveProperty('HOME');
    expect(test.target).not.toHaveProperty('XDG_RUNTIME_DIR');
  });

  it('applies the variables when the graphical session appears after the node started, and says so once', async () => {
    let told = 0;
    const test = manager(NO_SESSION);
    await test.environment.start(() => {
      told += 1;
    });
    expect(test.target).toEqual({});
    test.setEnvironment(SESSION);
    test.finishJob('graphical-session.target');
    await settle();
    expect(test.target['WAYLAND_DISPLAY']).toBe('wayland-1');
    expect(told).toBe(1);
    test.finishJob('graphical-session.target');
    await settle();
    expect(told).toBe(1);
  });

  it('ignores finished jobs of other units', async () => {
    let told = 0;
    const test = manager(NO_SESSION);
    await test.environment.start(() => {
      told += 1;
    });
    test.setEnvironment(SESSION);
    test.finishJob('kde-connect.service');
    await settle();
    expect(test.target).toEqual({});
    expect(told).toBe(0);
  });

  it('removes what it applied after the session ends and keeps what it did not apply', async () => {
    const target: ProcessVariables = { XDG_DATA_HOME: '/home/test/.local/share' };
    let told = 0;
    const test = manager(SESSION, target);
    await test.environment.start(() => {
      told += 1;
    });
    test.setEnvironment(NO_SESSION);
    test.finishJob('graphical-session.target');
    await settle();
    expect(target).toEqual({ XDG_DATA_HOME: '/home/test/.local/share' });
    expect(told).toBe(1);
  });

  it('takes the next login over a previous one', async () => {
    const test = await started(SESSION);
    test.setEnvironment([...NO_SESSION, 'WAYLAND_DISPLAY=wayland-2', 'XDG_CURRENT_DESKTOP=KDE']);
    test.finishJob('graphical-session.target');
    await settle();
    expect(test.target).toEqual({ WAYLAND_DISPLAY: 'wayland-2', XDG_CURRENT_DESKTOP: 'KDE' });
  });

  it('closes its connection when stopped', async () => {
    const test = await started(SESSION);
    test.environment.stop();
    expect(test.closed()).toBe(true);
  });
});

describe('screen control when the session appears after the node started', () => {
  const NONE = { kde: false, wayland: false, x11: false };
  const KDE = { kde: true, wayland: true, x11: false };

  it('reports no screen features without a session and the screens once it appears', async () => {
    const test = displayRig(BOTH, { environment: NONE });
    await expect(test.displays.features()).resolves.toEqual([]);
    test.setEnvironment(KDE);
    await expect(test.displays.features()).resolves.toContain('displays');
    expect(test.calls.some((call) => call.startsWith('kscreen-doctor'))).toBe(true);
  });

  it('refuses reads as not supported without a session, then serves them once it appears', async () => {
    const test = displayRig(BOTH, { environment: NONE });
    await expect(test.displays.read()).rejects.toMatchObject({ code: 'not_supported' });
    test.setEnvironment(KDE);
    expect((await test.displays.read()).outputs.length).toBeGreaterThan(0);
  });

  it('keeps answering without a session and never throws anything but not supported', async () => {
    const test = displayRig(BOTH, { environment: NONE });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(test.displays.features()).resolves.toEqual([]);
      await expect(test.displays.read()).rejects.toMatchObject({ code: 'not_supported' });
    }
    expect(test.failures).toEqual([]);
  });

  it('picks the backend again when the next login brings another kind of session', async () => {
    const test = displayRig(BOTH, { environment: KDE });
    await expect(test.displays.features()).resolves.toContain('displays');
    test.setEnvironment({ kde: false, wayland: false, x11: true });
    await expect(test.displays.features()).resolves.toEqual([]);
  });
});
