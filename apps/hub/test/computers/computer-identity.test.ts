import { NODE_HELLO, type DiscoveredDevice, type NodeHello } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computerExternalId, describeComputer } from '../../src/computers/computer-device';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import { ComputerNodeAccess } from '../../src/computers/node-access';
import { captureLogs } from '../support/logs';
import { HELLO, sessionRig } from '../support/session-rig';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-18T09:00:00.000Z');
const OTHER: NodeHello = NODE_HELLO.parse({ ...HELLO, machineId: 'f'.repeat(32) });
const SUMMARY = {
  type: 'sample',
  at: '2026-10-18T09:00:00.000Z',
  seq: 0,
  parts: {
    summary: {
      cpuLoad: 12,
      cpuTemperature: null,
      memoryPercent: 25,
      swapPercent: null,
      gpuLoad: null,
      gpuTemperature: null,
      gpuMemoryPercent: null,
      cpuWatts: null,
      gpuWatts: null,
      downloadRate: 1,
      uploadRate: 0,
      fullestDisk: { mount: '/home', percent: 80 },
      batteryLevel: null,
      charging: null,
      totalWatts: null,
      processCount: 3,
      uptimeSeconds: 60,
    },
  },
};

let opened: TestStore;
let ownerId = '';

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  ownerId = opened.store.clients.create(
    { name: 'Owner', platform: 'web', role: 'owner', tokenHash: 'c'.repeat(64) },
    true,
  ).id;
});

afterEach(async () => {
  await opened.close();
});

function computers(): readonly { readonly external_id: string; readonly model: string }[] {
  return opened.store.devices.list().filter((device) => device.kind === 'computer');
}

function claim(access: ComputerNodeAccess, hello: NodeHello): string {
  const { code } = access.pair('http://127.0.0.1:7880', ownerId);
  return access.claim(code, hello, 'local').paired.device_id;
}

describe('one computer row per machine', () => {
  it('uses the machine id alone for hub and pc sessions', () => {
    expect(computerExternalId(HELLO.machineId)).toBe(`computer:${HELLO.machineId}`);
    const hub = describeComputer(HELLO, 'hub', [], { power: [], machine: [] });
    const pc = describeComputer(HELLO, 'pc', [], { power: [], machine: [] });
    expect(hub.externalId).toBe(pc.externalId);
    expect(hub.model).not.toBe(pc.model);
  });

  it('pairs onto the existing hub row and never creates a second one', () => {
    const [host] = opened.store.devices.upsert([
      {
        ...describeComputer(HELLO, 'hub', [], { power: [], machine: [] }),
        parentId: null,
        providerRoom: null,
        roomId: null,
      },
    ]);
    const access = new ComputerNodeAccess(opened.store, () => NOW);

    const first = claim(access, HELLO);
    const second = claim(access, HELLO);

    expect(first).toBe(host?.id);
    expect(second).toBe(host?.id);
    expect(computers()).toHaveLength(1);
  });

  it('pairs a machine that was never seen into exactly one row, then reuses it', () => {
    const access = new ComputerNodeAccess(opened.store, () => NOW);

    const first = claim(access, OTHER);
    const second = claim(access, OTHER);

    expect(second).toBe(first);
    expect(computers()).toHaveLength(1);
    expect(computers()[0]?.external_id).toBe(`computer:${OTHER.machineId}`);
  });
});

describe('hub or pc follows from being the hub machine', () => {
  const WITH_INTERFACE: NodeHello = NODE_HELLO.parse({
    ...HELLO,
    interfaces: [{ name: 'eth0', mac: 'aa:bb:cc:dd:ee:ff', addresses: ['192.168.1.5'] }],
    power: ['shut_down'],
  });
  const OTHER_WITH_INTERFACE: NodeHello = NODE_HELLO.parse({
    ...WITH_INTERFACE,
    machineId: OTHER.machineId,
  });

  function capabilitiesOf(devices: readonly DiscoveredDevice[]): readonly string[] {
    return devices.at(-1)?.capabilities.map((capability) => capability.key) ?? [];
  }

  it('gives the node session on the hub machine the hub role and other machines the pc role', () => {
    const directory = new ComputerDirectory(HELLO.machineId);
    const hub = sessionRig('device', { directory });
    const client = sessionRig('other', { directory, hello: OTHER });

    expect(hub.session.role).toBe('hub');
    expect(client.session.role).toBe('pc');
    expect(directory.isHubMachine(HELLO.machineId)).toBe(true);
    expect(directory.isHubMachine(OTHER.machineId)).toBe(false);
  });

  it('gives every machine the pc role when the hub machine is unknown', () => {
    expect(sessionRig('device').session.role).toBe('pc');
  });

  it('describes the hub machine with the hub model and another machine as a pc', () => {
    const directory = new ComputerDirectory(HELLO.machineId);
    const hubDescribed: DiscoveredDevice[] = [];
    const otherDescribed: DiscoveredDevice[] = [];
    const hub = sessionRig('device', {
      directory,
      devices: (devices) => hubDescribed.push(...devices),
    });
    const other = sessionRig('other', {
      directory,
      hello: OTHER,
      devices: (devices) => otherDescribed.push(...devices),
    });
    hub.deliver(SUMMARY);
    other.deliver(SUMMARY);

    expect(hubDescribed.map((device) => device.externalId)).toEqual([
      `computer:${HELLO.machineId}`,
    ]);
    expect(hubDescribed[0]?.model).toBe(
      describeComputer(HELLO, 'hub', [], { power: [], machine: [] }).model,
    );
    expect(otherDescribed.map((device) => device.externalId)).toEqual([
      `computer:${OTHER.machineId}`,
    ]);
    expect(otherDescribed[0]?.model).toBe(
      describeComputer(OTHER, 'pc', [], { power: [], machine: [] }).model,
    );
  });

  it('tells the hub that its own machine resolved, and never a pc', () => {
    const directory = new ComputerDirectory(HELLO.machineId);
    const resolved: string[] = [];
    sessionRig('hub-device', {
      directory,
      hubComputerResolved: (deviceId) => resolved.push(deviceId),
    });
    sessionRig('pc-device', {
      directory,
      hello: OTHER,
      hubComputerResolved: (deviceId) => resolved.push(deviceId),
    });

    expect(resolved).toEqual(['hub-device']);
  });

  it('offers wake on LAN for a pc and never for the machine the hub runs on', () => {
    const directory = new ComputerDirectory(HELLO.machineId);
    const hubDescribed: DiscoveredDevice[] = [];
    const pcDescribed: DiscoveredDevice[] = [];
    const hub = sessionRig('device', {
      directory,
      hello: WITH_INTERFACE,
      devices: (devices) => hubDescribed.push(...devices),
    });
    const pc = sessionRig('other', {
      directory,
      hello: OTHER_WITH_INTERFACE,
      devices: (devices) => pcDescribed.push(...devices),
    });
    hub.deliver(SUMMARY);
    pc.deliver(SUMMARY);

    expect(capabilitiesOf(hubDescribed)).toContain('shut_down');
    expect(capabilitiesOf(hubDescribed)).not.toContain('wake');
    expect(capabilitiesOf(pcDescribed)).toContain('shut_down');
    expect(capabilitiesOf(pcDescribed)).toContain('wake');
  });
});
