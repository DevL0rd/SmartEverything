import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import { describeComputer, describeHub } from '../../src/computers/computer-device';
import { ComputerService } from '../../src/computers/computer-service';
import { resetComputerPresence } from '../../src/computers/computer-presence';
import { captureLogs, testLogger } from '../support/logs';
import { HELLO, sessionRig } from '../support/session-rig';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function records(): { readonly pc: string; readonly hub: string } {
  const saved = opened.store.devices.upsert(
    [
      describeComputer(HELLO, [], { power: [], machine: [] }),
      describeHub({ hostname: HELLO.hostname, osName: HELLO.os.name }),
    ].map((device) => ({ ...device, parentId: null, providerRoom: null, roomId: null })),
  );
  const [pc, hub] = saved;
  if (pc === undefined || hub === undefined) throw new Error('Computer fixtures were not saved.');
  return { pc: pc.id, hub: hub.id };
}

function service(directory: ComputerDirectory): ComputerService {
  return new ComputerService({ store: opened.store, directory, log: testLogger('computers') });
}

describe('computer presence', () => {
  it('clears only active paired PC presence on startup while retaining its identity and grants', async () => {
    const { pc, hub } = records();
    const nodes = opened.store.computerNodes;
    nodes.bind({
      deviceId: pc,
      machineId: HELLO.machineId,
      tokenHash: 'node-token',
      hubUrl: 'https://hub.example.com',
      windowClientId: null,
    });
    nodes.setRuntimeMcpToken(pc, 'claude', 'runtime-token');
    const changes: string[] = [];
    await resetComputerPresence(opened.store, (id, online) => {
      changes.push(id);
      opened.store.devices.setOnline([id], online);
      return Promise.resolve();
    });
    expect(changes).toEqual([pc]);
    expect(opened.store.devices.byId(pc).online).toBe(false);
    expect(opened.store.devices.byId(hub).online).toBe(true);
    expect(nodes.byToken('node-token')?.device_id).toBe(pc);
    expect(nodes.byRuntimeMcpToken('runtime-token')?.device_id).toBe(pc);
    expect(opened.store.devices.list()).toHaveLength(2);
    await resetComputerPresence(opened.store, (id) => {
      throw new Error(`Already offline computer was reset: ${id}`);
    });
  });

  it('leaves unpaired and revoked computer records untouched at startup', async () => {
    const { pc } = records();
    const reset = (id: string): Promise<void> => {
      throw new Error(`An unpaired computer was reset: ${id}`);
    };
    await resetComputerPresence(opened.store, reset);
    opened.store.computerNodes.bind({
      deviceId: pc,
      machineId: HELLO.machineId,
      tokenHash: 'node-token',
      hubUrl: 'https://hub.example.com',
      windowClientId: null,
    });
    opened.store.computerNodes.revoke(pc);
    await resetComputerPresence(opened.store, reset);
    expect(opened.store.devices.byId(pc).online).toBe(true);
    expect(opened.store.computerNodes.activeDeviceIds()).toEqual([]);
  });

  it('reports a persisted online PC as offline without a live computer session', () => {
    const { pc } = records();
    expect(
      service(new ComputerDirectory()).detail(pc, { owner: true, profileId: null }),
    ).toMatchObject({ online: false, at: null, parts: {} });
  });

  it('keeps the running hub online without pretending it has a telemetry session', () => {
    const { hub } = records();
    expect(
      service(new ComputerDirectory()).detail(hub, { owner: true, profileId: null }),
    ).toMatchObject({ online: true, at: null, parts: {}, features: [] });
  });

  it('uses the PC session when connected and becomes offline when it leaves', () => {
    const { pc } = records();
    opened.store.devices.setOnline([pc], false);
    const directory = new ComputerDirectory();
    const { session } = sessionRig(pc);
    const leave = directory.add(session);
    const computers = service(directory);
    const viewer = { owner: true, profileId: null };
    expect(computers.detail(pc, viewer).online).toBe(true);
    leave();
    session.stop();
    expect(computers.detail(pc, viewer).online).toBe(false);
  });
});
