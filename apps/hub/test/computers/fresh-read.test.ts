import { deviceTarget } from '../../src/metrics/viewers';
import type { HubFrame } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputerDirectory } from '../../src/computers/computer-directory';
import { ComputerService } from '../../src/computers/computer-service';
import { captureLogs, testLogger } from '../support/logs';
import { sessionRig } from '../support/session-rig';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

function setup(): {
  readonly service: ComputerService;
  readonly deviceId: string;
  readonly rig: ReturnType<typeof sessionRig>;
} {
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer:desk',
      parentId: null,
      kind: 'computer',
      name: 'Desk',
      model: 'smarteverything.computer',
      manufacturer: 'Linux',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  const deviceId = device?.id ?? '';
  const rig = sessionRig(deviceId);
  const directory = new ComputerDirectory();
  directory.add(rig.session);
  const service = new ComputerService({
    store: opened.store,
    directory,
    log: testLogger('computers'),
  });
  return { service, deviceId, rig };
}

function demandedTopics(sent: readonly HubFrame[]): string[][] {
  return sent.flatMap((frame) =>
    frame.type === 'demand' ? [Object.keys(frame.demand.topics).sort()] : [],
  );
}

const OWNER = { owner: true, profileId: null } as const;

beforeEach(async () => {
  captureLogs();
  vi.useFakeTimers();
  opened = await testStore();
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

describe('a fresh computer reading', () => {
  it('asks the computer for every metric, waits for its first full frame, then lets go', async () => {
    const { service, deviceId, rig } = setup();
    const done = service.freshDetail(deviceId, OWNER);
    const asked = demandedTopics(rig.sent).at(-1);
    expect(asked).toEqual(
      ['summary', 'cpu', 'gpu', 'memory', 'disks', 'network', 'sensors', 'power'].sort(),
    );
    rig.deliver({
      type: 'sample',
      at: '2026-10-08T10:00:01.000Z',
      seq: 1,
      key: true,
      parts: { summary: { ...SUMMARY, cpuLoad: 77 } },
    });
    const detail = await done;
    expect(detail.parts.summary?.cpuLoad).toBe(77);
    expect(demandedTopics(rig.sent).at(-1)).toEqual([]);
    expect(rig.viewers.watched(deviceTarget(deviceId))).toBe(false);
  });

  it('does not wait when every metric is already being watched', async () => {
    const { service, deviceId, rig } = setup();
    const topics = ['summary', 'cpu', 'gpu', 'memory', 'disks', 'network', 'sensors', 'power'];
    rig.viewers.hold(
      'phone',
      topics.map((topic) => ({ target: deviceTarget(deviceId), topic })),
    );
    const before = rig.sent.length;
    await service.freshDetail(deviceId, OWNER);
    expect(rig.sent.length).toBe(before);
    expect(rig.viewers.demand(deviceTarget(deviceId)).topics.size).toBe(topics.length);
  });

  it('answers with what it has when the computer sends nothing in time, and still lets go', async () => {
    const { service, deviceId, rig } = setup();
    const done = service.freshDetail(deviceId, OWNER);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(done).resolves.toMatchObject({ deviceId, online: true });
    expect(rig.viewers.watched(deviceTarget(deviceId))).toBe(false);
  });
});

const SUMMARY = {
  cpuLoad: 12,
  cpuTemperature: null,
  memoryPercent: 25,
  swapPercent: null,
  gpuLoad: null,
  gpuTemperature: null,
  gpuMemoryPercent: null,
  cpuWatts: null,
  gpuWatts: null,
  downloadRate: 0,
  uploadRate: 0,
  fullestDisk: null,
  batteryLevel: null,
  charging: null,
  totalWatts: null,
  processCount: 0,
  uptimeSeconds: 60,
};
