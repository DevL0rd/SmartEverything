import { describe, expect, it } from 'vitest';
import { ServiceController } from '../src/service/controller.js';
import type { ServiceManager } from '../src/service/manager.js';
import { nodeWindowFile } from '../src/service/ready.js';
import { LOCATIONS, fakeSystem, type FakeSystem } from './support/fake-system.js';

const TOKEN = `set_${'b'.repeat(64)}`;
const HUB = 'https://hub.example:8788';

const manager: ServiceManager = {
  kind: 'systemd',
  state: () => Promise.resolve({ installed: true, current: true, active: true, detail: 'active' }),
  install: () => Promise.resolve(),
  start: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  restart: () => Promise.resolve(),
  uninstall: () => Promise.resolve(),
  restoreOriginal: () => Promise.resolve(false),
  linger: () => Promise.resolve('disabled'),
  enableLinger: () => Promise.resolve(),
};

function controllerOn(system: FakeSystem): ServiceController {
  return new ServiceController({
    manager,
    locations: LOCATIONS,
    system,
    go2rtcBinary: '/opt/go2rtc',
    openSocket: () => ({ close: () => undefined, addEventListener: () => undefined }),
    timeoutMs: 80,
    failed: () => undefined,
  });
}

function runNode(): { system: FakeSystem; controller: ServiceController } {
  const system = fakeSystem();
  system.alive.add(200);
  system.serving.add(HUB);
  system.touch(
    LOCATIONS.readyFile,
    JSON.stringify({
      role: 'node',
      pid: 200,
      hub_url: HUB,
      device_id: crypto.randomUUID(),
      connected: true,
      version: '1.0.0',
    }),
  );
  return { system, controller: controllerOn(system) };
}

describe('the window of a computer that runs as a node', () => {
  it('has no connection until the normal Pair screen has paired it', async () => {
    const { controller } = runNode();
    expect(await controller.server()).toBeNull();
  });

  it('keeps the pairing the Pair screen saved, owner-only, and hands it back', async () => {
    const { system, controller } = runNode();
    await controller.setWindow({ url: `${HUB}/`, token: TOKEN });
    expect(JSON.parse(system.stored.get(nodeWindowFile(LOCATIONS)) ?? 'null')).toStrictEqual({
      hub_url: HUB,
      token: TOKEN,
    });
    expect(system.modes.get(nodeWindowFile(LOCATIONS))).toBe(0o600);
    expect(await controller.server()).toStrictEqual({ url: HUB, token: TOKEN });
  });

  it('forgets a pairing the home refused, so the Pair screen shows again', async () => {
    const { system, controller } = runNode();
    await controller.setWindow({ url: HUB, token: TOKEN });
    await controller.setWindow(null);
    expect(system.stored.has(nodeWindowFile(LOCATIONS))).toBe(false);
    expect(await controller.server()).toBeNull();
  });

  it('keeps a pairing made through another endpoint of the same home', async () => {
    const { controller } = runNode();
    const remote = 'https://home.example.com';
    await controller.setWindow({ url: `${remote}/`, token: TOKEN });
    expect(await controller.server()).toStrictEqual({ url: remote, token: TOKEN });
  });
});
