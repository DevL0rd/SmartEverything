import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DesktopServiceStatus } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ManagedByStableAppError,
  ServiceController,
  ServiceTimeoutError,
} from '../src/service/controller.js';
import type { ManagerState, ServiceManager } from '../src/service/manager.js';
import { serviceLocations } from '../src/service/locations.js';
import { desktopConnectionFile, ServiceFileInvalidError } from '../src/service/ready.js';
import { nodeSystem } from '../src/service/system.js';
import { LOCATIONS, fakeSystem, type FakeSystem } from './support/fake-system.js';

const TOKEN = `set_${'a'.repeat(64)}`;
const URL_7880 = 'http://127.0.0.1:7880';
const DEVICE = '5b2f6c0e-4a4e-4c1a-9a4e-3d1f0e9b7a11';
const NODE_SETTINGS = {
  node: { hub_url: URL_7880, node_token: `sen_${'b'.repeat(43)}`, device_id: DEVICE },
};
const NODE_CONFIG = JSON.stringify(NODE_SETTINGS);
function ready(pid: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ...extra,
    pid,
    hub_url: URL_7880,
    device_id: DEVICE,
    connected: false,
    version: '1',
  });
}

interface ServiceShape {
  readonly installed: boolean;
  readonly current: boolean;
  readonly active: boolean;
  readonly respond: boolean;
  readonly leavesReady: boolean;
}

class FakeService implements ServiceManager {
  readonly kind = 'systemd';
  readonly calls: string[] = [];
  installed: boolean;
  current: boolean;
  active: boolean;
  respond: boolean;
  leavesReady: boolean;
  pid = 100;

  constructor(
    private readonly system: FakeSystem,
    shape: Partial<ServiceShape>,
  ) {
    this.installed = shape.installed ?? false;
    this.current = shape.current ?? false;
    this.active = shape.active ?? false;
    this.respond = shape.respond ?? true;
    this.leavesReady = shape.leavesReady ?? false;
  }

  serve(): void {
    this.pid += 1;
    this.active = true;
    this.system.alive.add(this.pid);
    this.system.touch(LOCATIONS.readyFile, ready(this.pid));
  }

  halt(): void {
    this.active = false;
    this.system.alive.delete(this.pid);
    if (!this.leavesReady) this.system.touch(LOCATIONS.readyFile, null);
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
  readonly published: DesktopServiceStatus[];
  readonly failures: unknown[];
}

function harness(initial: Partial<ServiceShape> = {}, managedBy?: 'stable-app'): Harness {
  const system = fakeSystem();
  const service = new FakeService(system, initial);
  system.touch(LOCATIONS.configFile, NODE_CONFIG);
  system.touch(
    desktopConnectionFile(LOCATIONS),
    JSON.stringify({ hub_url: URL_7880, token: TOKEN }),
  );
  const failures: unknown[] = [];
  const controller = new ServiceController({
    manager: service,
    locations: LOCATIONS,
    system,
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
  return { system, service, controller, published, failures };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

describe('ServiceController.ensure', () => {
  it('installs and starts a configured computer even while its Hub is unreachable', async () => {
    const run = harness();
    expect((await run.controller.status()).health).toBe('not-installed');
    const status = await run.controller.ensure();
    expect(status).toStrictEqual({
      manager: 'systemd',
      health: 'running',
      installed: true,
      active: true,
      url: null,
      dataDirectory: LOCATIONS.dataDirectory,
      detail: 'systemd reports active (running)',
      linger: 'disabled',
    });
    expect(run.service.calls).toStrictEqual(['install', 'start']);
    expect(run.system.stored.get(LOCATIONS.configFile)).toBe(NODE_CONFIG);
    expect(await run.controller.server()).toStrictEqual({ url: URL_7880, token: TOKEN });
    expect(run.published.at(-1)?.health).toBe('running');
    expect(run.system.watchers()).toBe(0);
  });

  it('stops an outdated service before installing the new definition', async () => {
    const run = harness({ installed: true, current: false });
    run.service.serve();
    await run.controller.ensure();
    expect(run.service.calls).toStrictEqual(['stop', 'install', 'start']);
  });

  it('leaves a current running service alone', async () => {
    const run = harness({ installed: true, current: true });
    run.service.serve();
    await run.controller.ensure();
    expect(run.service.calls).toStrictEqual([]);
  });

  it('does not install an unpaired computer service', async () => {
    const run = harness();
    run.system.touch(LOCATIONS.configFile, null);
    await expect(run.controller.ensure()).rejects.toThrow('Pair this computer with a Hub');
    expect(run.service.calls).toStrictEqual([]);
  });

  it('fails visibly when the Computer service does not come up in time and reports it as failed', async () => {
    const run = harness({ respond: false });
    await expect(run.controller.ensure()).rejects.toThrow(ServiceTimeoutError);
    await expect(run.controller.ensure()).rejects.toThrow(
      'the Computer service must be running within 0.08 seconds; systemd reports inactive (dead). Its log is in Settings.',
    );
    await settle();
    const status = await run.controller.status();
    expect(status.health).toBe('failed');
    expect(status.detail).toContain('within 0.08 seconds');
    expect(run.published.at(-1)?.health).toBe('failed');
    expect(await run.controller.server()).toStrictEqual({ url: URL_7880, token: TOKEN });
  });

  it('refuses settings the Computer service would refuse', async () => {
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
    expect(await run.controller.server()).toStrictEqual({ url: URL_7880, token: TOKEN });
    expect((await run.controller.start()).health).toBe('running');
    expect((await run.controller.uninstall()).health).toBe('not-installed');
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

  it('reads the saved Hub without waiting for the computer service', async () => {
    const run = harness({ installed: true, current: true, active: true });
    expect(await run.controller.server()).toStrictEqual({ url: URL_7880, token: TOKEN });
    expect(run.service.calls).toStrictEqual([]);
  });

  it('notices the computer service starting or stopping through watched files', async () => {
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
      'must hold the pid, URL and version of the running Computer service',
    );
    run.system.touch(LOCATIONS.readyFile, ready(9));
    expect((await run.controller.status()).health).toBe('starting');
    run.system.alive.add(9);
    expect((await run.controller.status()).health).toBe('running');
    run.system.touch(desktopConnectionFile(LOCATIONS), 'not a token');
    await expect(run.controller.server()).rejects.toThrow(ServiceFileInvalidError);
  });
});

describe('ServiceController managed by the stable app', () => {
  it('reads the running Computer service but refuses every change and writes nothing', async () => {
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
    expect(run.system.stored.get(LOCATIONS.configFile)).toBe(NODE_CONFIG);
    const status = await run.controller.status();
    expect([status.health, status.managedBy]).toStrictEqual(['running', 'stable-app']);
    expect(await run.controller.server()).toStrictEqual({ url: URL_7880, token: TOKEN });
  });
});

describe('ready file written by an earlier Computer', () => {
  const EARLIER = ready(50, { role: 'node' });

  it('is not read while the installed definition is still the earlier one', async () => {
    const run = harness({ installed: true, current: false, active: true });
    run.system.touch(LOCATIONS.readyFile, EARLIER);
    run.system.alive.add(50);
    expect((await run.controller.status()).health).toBe('starting');
  });

  it('is removed when the earlier Computer is stopped, so the new one is never judged by it', async () => {
    const run = harness({ installed: true, current: false, active: true, leavesReady: true });
    run.system.touch(LOCATIONS.readyFile, EARLIER);
    const status = await run.controller.ensure();
    expect(run.service.calls).toStrictEqual(['stop', 'install', 'start']);
    expect(status.health).toBe('running');
    expect(run.system.stored.get(LOCATIONS.readyFile)).toBe(ready(run.service.pid));
  });
});

describe('ServiceController.config', () => {
  let directory = '';

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function onDisk(text: string): Promise<ServiceController> {
    directory = await mkdtemp(join(tmpdir(), 'se-computer-'));
    const locations = serviceLocations({
      home: directory,
      dataDirectory: directory,
      xdgConfigHome: undefined,
    });
    await writeFile(locations.configFile, text);
    return new ServiceController({
      manager: new FakeService(fakeSystem(), {}),
      locations,
      system: nodeSystem,
      timeoutMs: 80,
      failed: (): void => undefined,
    });
  }

  it('migrates a configuration that still carries role node once, before it is read', async () => {
    const controller = await onDisk(JSON.stringify({ role: 'node', ...NODE_SETTINGS }));
    expect((await controller.config())?.node.device_id).toBe(DEVICE);
    const file = join(directory, 'service.json');
    expect(JSON.parse(await readFile(file, 'utf8'))).toStrictEqual(NODE_SETTINGS);
    const migrated = await readFile(file, 'utf8');
    expect((await controller.config())?.node.device_id).toBe(DEVICE);
    expect(await readFile(file, 'utf8')).toBe(migrated);
  });

  it('refuses a configuration with any other role and leaves the file as it was', async () => {
    const text = JSON.stringify({ role: 'hub', ...NODE_SETTINGS });
    const controller = await onDisk(text);
    await expect(controller.config()).rejects.toThrow(/role must be node/u);
    expect(await readFile(join(directory, 'service.json'), 'utf8')).toBe(text);
  });
});
