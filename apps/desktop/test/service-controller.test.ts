import type { DesktopServiceStatus } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  ManagedByStableAppError,
  ServiceController,
  ServiceNotRunningError,
  ServiceTimeoutError,
} from '../src/service/controller.js';
import type { LiveSocket } from '../src/service/live-link.js';
import type { ManagerState, ServiceManager } from '../src/service/manager.js';
import { OwnerTokenMissingError, ServiceFileInvalidError } from '../src/service/ready.js';
import { LOCATIONS, fakeSystem, type FakeSystem } from './support/fake-system.js';

const TOKEN = `set_${'a'.repeat(64)}`;
const URL_7880 = 'http://127.0.0.1:7880';

interface ServiceShape {
  readonly installed: boolean;
  readonly current: boolean;
  readonly active: boolean;
  readonly respond: boolean;
}

class FakeService implements ServiceManager {
  readonly kind = 'systemd';
  readonly calls: string[] = [];
  installed: boolean;
  current: boolean;
  active: boolean;
  respond: boolean;
  pid = 100;

  constructor(
    private readonly system: FakeSystem,
    shape: Partial<ServiceShape>,
  ) {
    this.installed = shape.installed ?? false;
    this.current = shape.current ?? false;
    this.active = shape.active ?? false;
    this.respond = shape.respond ?? true;
  }

  serve(): void {
    this.pid += 1;
    this.active = true;
    this.system.alive.add(this.pid);
    this.system.serving.add(URL_7880);
    this.system.touch(LOCATIONS.ownerTokenFile, `${TOKEN}\n`);
    this.system.touch(
      LOCATIONS.readyFile,
      JSON.stringify({ pid: this.pid, url: URL_7880, version: '1.0.0' }),
    );
  }

  halt(): void {
    this.active = false;
    this.system.alive.delete(this.pid);
    this.system.serving.delete(URL_7880);
    this.system.touch(LOCATIONS.readyFile, null);
  }

  restoreOriginal(): Promise<boolean> {
    return Promise.resolve(false);
  }

  state(): Promise<ManagerState> {
    return Promise.resolve({
      installed: this.installed,
      current: this.current,
      active: this.active,
      detail: this.active ? 'systemd reports active (running)' : 'systemd reports inactive (dead)',
    });
  }

  install(): Promise<void> {
    this.calls.push('install');
    this.installed = true;
    this.current = true;
    return Promise.resolve();
  }

  start(): Promise<void> {
    this.calls.push('start');
    return this.later();
  }

  stop(): Promise<void> {
    this.calls.push('stop');
    this.halt();
    return Promise.resolve();
  }

  restart(): Promise<void> {
    this.calls.push('restart');
    this.halt();
    return this.later();
  }

  uninstall(): Promise<void> {
    this.calls.push('uninstall');
    this.halt();
    this.installed = false;
    return Promise.resolve();
  }

  linger(): Promise<'disabled'> {
    return Promise.resolve('disabled');
  }

  enableLinger(): Promise<void> {
    this.calls.push('enable-linger');
    return Promise.resolve();
  }

  private later(): Promise<void> {
    if (this.respond) {
      setTimeout(() => {
        this.serve();
      }, 1);
    }
    return Promise.resolve();
  }
}

interface Harness {
  readonly system: FakeSystem;
  readonly service: FakeService;
  readonly controller: ServiceController;
  readonly sockets: { url: string; protocols: string[]; close: () => void; closed: boolean }[];
  readonly published: DesktopServiceStatus[];
  readonly failures: unknown[];
}

function harness(initial: Partial<ServiceShape> = {}, managedBy?: 'stable-app'): Harness {
  const system = fakeSystem();
  const service = new FakeService(system, initial);
  const sockets: Harness['sockets'] = [];
  const failures: unknown[] = [];
  const controller = new ServiceController({
    manager: service,
    locations: LOCATIONS,
    system,
    go2rtcBinary: '/opt/go2rtc',
    openSocket: (url, protocols): LiveSocket => {
      const listeners: (() => void)[] = [];
      const socket = {
        url,
        protocols,
        closed: false,
        close: (): void => {
          socket.closed = true;
          listeners.forEach((listener) => {
            listener();
          });
        },
      };
      sockets.push(socket);
      return {
        close: socket.close,
        addEventListener: (_type, listener): void => {
          listeners.push(listener);
        },
      };
    },
    timeoutMs: 80,
    failed: (cause): void => {
      failures.push(cause);
    },
    managedBy,
  });
  const published: DesktopServiceStatus[] = [];
  controller.onChange((status) => {
    published.push(status);
  });
  return { system, service, controller, sockets, published, failures };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe('ServiceController.ensure', () => {
  it('writes the settings, installs and starts the service, then hands out its address and token', async () => {
    const run = harness();
    expect((await run.controller.status()).health).toBe('not-installed');
    const status = await run.controller.ensure();
    expect(status).toStrictEqual({
      manager: 'systemd',
      health: 'running',
      installed: true,
      active: true,
      url: URL_7880,
      dataDirectory: LOCATIONS.dataDirectory,
      detail: 'systemd reports active (running)',
      linger: 'disabled',
    });
    expect(run.service.calls).toStrictEqual(['install', 'start']);
    expect(run.system.stored.get(LOCATIONS.configFile)).toBe(
      '{\n  "go2rtcBinary": "/opt/go2rtc"\n}\n',
    );
    expect(run.system.modes.get(LOCATIONS.configFile)).toBe(0o600);
    expect(await run.controller.server()).toStrictEqual({ url: URL_7880, token: TOKEN });
    expect(run.sockets.map((socket) => [socket.url, socket.protocols])).toStrictEqual([
      ['ws://127.0.0.1:7880/live', ['smarteverything.live.v1', `bearer.${TOKEN}`]],
    ]);
    expect(run.published.at(-1)?.health).toBe('running');
    expect(run.system.watchers()).toBe(0);
  });

  it('stops an outdated service before installing the new definition', async () => {
    const run = harness({ installed: true, current: false });
    run.service.serve();
    run.system.touch(LOCATIONS.configFile, '{\n  "go2rtcBinary": "/opt/go2rtc"\n}\n');
    await run.controller.ensure();
    expect(run.service.calls).toStrictEqual(['stop', 'install', 'start']);
  });

  it('restarts a current service whose settings changed and leaves an unchanged one alone', async () => {
    const run = harness({ installed: true, current: true });
    run.service.serve();
    await run.controller.ensure();
    expect(run.service.calls).toStrictEqual(['restart']);
    await run.controller.ensure();
    expect(run.service.calls).toStrictEqual(['restart']);
  });

  it('fails visibly when the server does not come up in time and reports it as failed', async () => {
    const run = harness({ respond: false });
    await expect(run.controller.ensure()).rejects.toThrow(ServiceTimeoutError);
    await expect(run.controller.ensure()).rejects.toThrow(
      'the server must be running within 0.08 seconds; systemd reports inactive (dead). Its log is in Settings.',
    );
    await settle();
    const status = await run.controller.status();
    expect(status.health).toBe('failed');
    expect(status.detail).toContain('within 0.08 seconds');
    expect(run.published.at(-1)?.health).toBe('failed');
    await expect(run.controller.server()).rejects.toThrow(ServiceNotRunningError);
  });

  it('refuses settings the server would refuse', async () => {
    const run = harness();
    run.system.touch(LOCATIONS.configFile, '{"port":"x"}');
    await expect(run.controller.ensure()).rejects.toThrow(/port/u);
    await expect(run.controller.config()).rejects.toThrow(/port/u);
  });
});

describe('ServiceController controls', () => {
  it('restarts into a new process, stops and uninstalls', async () => {
    const run = harness();
    await run.controller.ensure();
    const restarted = await run.controller.restart();
    expect(restarted.health).toBe('running');
    expect(run.service.pid).toBe(102);
    const stopped = await run.controller.stop();
    expect(stopped.health).toBe('stopped');
    await expect(run.controller.server()).rejects.toThrow(
      'the SmartEverything server must be running for the window to reach it; it is stopped (systemd reports inactive (dead))',
    );
    expect((await run.controller.start()).health).toBe('running');
    await settle();
    const followed = run.sockets.at(-1);
    expect(followed?.closed).toBe(false);
    expect((await run.controller.uninstall()).health).toBe('not-installed');
    expect(followed?.closed).toBe(true);
    expect((await run.controller.enableLinger()).linger).toBe('disabled');
    expect(run.service.calls).toStrictEqual([
      'install',
      'start',
      'restart',
      'stop',
      'start',
      'uninstall',
      'enable-linger',
    ]);
  });

  it('waits for a starting server before handing out its address', async () => {
    const run = harness({ installed: true, current: true, active: true });
    const pending = run.controller.server();
    await settle();
    run.service.serve();
    expect(await pending).toStrictEqual({ url: URL_7880, token: TOKEN });
  });

  it('notices a server that went away through its live connection and watched files', async () => {
    const run = harness();
    await run.controller.ensure();
    run.controller.watch();
    run.service.halt();
    await settle();
    expect(run.published.at(-1)?.health).toBe('stopped');
    run.service.serve();
    await settle();
    expect(run.published.at(-1)?.health).toBe('running');
    const count = run.published.length;
    run.system.touch(`${LOCATIONS.dataDirectory}/unrelated`, 'x');
    await settle();
    expect(run.published).toHaveLength(count);
    run.service.active = false;
    run.system.serving.delete(URL_7880);
    run.sockets.at(-1)?.close();
    await settle();
    expect(run.published.at(-1)?.health).toBe('stopped');
    run.controller.close();
    expect(run.system.watchers()).toBe(0);
  });

  it('shows the last lines of the output and service logs', async () => {
    const run = harness();
    run.system.touch(LOCATIONS.outputLogFile, 'crash\n');
    run.system.touch(
      LOCATIONS.logFile,
      Array.from({ length: 205 }, (_unused, index) => `line ${String(index)}`).join('\n'),
    );
    const logs = await run.controller.logs();
    expect(logs.file).toBe(LOCATIONS.logFile);
    expect(logs.lines[0]).toBe('output: crash');
    expect(logs.lines[1]).toBe('line 5');
    expect(logs.lines).toHaveLength(201);
    expect((await harness().controller.logs()).lines).toStrictEqual([]);
  });
});

describe('ready and token files', () => {
  it('refuses malformed ready and token files and ignores a ready file of a dead process', async () => {
    const run = harness({ installed: true, current: true, active: true });
    run.system.touch(LOCATIONS.readyFile, '{');
    await expect(run.controller.status()).rejects.toThrow(ServiceFileInvalidError);
    run.system.touch(LOCATIONS.readyFile, '{"pid":1}');
    await expect(run.controller.status()).rejects.toThrow(
      'must hold the pid, URL and version of the running server',
    );
    run.system.touch(LOCATIONS.readyFile, JSON.stringify({ pid: 9, url: URL_7880, version: '1' }));
    expect((await run.controller.status()).health).toBe('starting');
    run.system.alive.add(9);
    run.system.serving.add(URL_7880);
    await expect(run.controller.server()).rejects.toThrow(OwnerTokenMissingError);
    run.system.touch(LOCATIONS.ownerTokenFile, 'not a token');
    await expect(run.controller.server()).rejects.toThrow('a file without a valid token');
  });
});

describe('ServiceController managed by the stable app', () => {
  it('reads the running server but refuses every change and writes nothing', async () => {
    const run = harness({ installed: true, current: true }, 'stable-app');
    run.service.serve();
    const changes = [
      (): Promise<DesktopServiceStatus> => run.controller.ensure(),
      (): Promise<DesktopServiceStatus> => run.controller.stop(),
      (): Promise<DesktopServiceStatus> => run.controller.restart(),
      (): Promise<DesktopServiceStatus> => run.controller.uninstall(),
      (): Promise<DesktopServiceStatus> => run.controller.enableLinger(),
    ];
    for (const change of changes) {
      await expect(change()).rejects.toThrow(ManagedByStableAppError);
    }
    expect(run.service.calls).toStrictEqual([]);
    expect(run.system.stored.get(LOCATIONS.configFile)).toBeUndefined();
    const status = await run.controller.status();
    expect([status.health, status.managedBy]).toStrictEqual(['running', 'stable-app']);
    expect(await run.controller.server()).toStrictEqual({ url: URL_7880, token: TOKEN });
  });
});
