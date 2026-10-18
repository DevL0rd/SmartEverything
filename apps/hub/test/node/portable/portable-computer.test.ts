import { SAMPLE_TOPICS, type Battery } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PortableComputer } from '../../../src/node/collectors/portable/portable-computer';
import type {
  DiskReading,
  InterfaceReading,
  MemoryReading,
  PlatformReadings,
} from '../../../src/node/collectors/portable/platform-readings';
import type { Tick } from '../../../src/node/collectors/tick';
import { captureLogs } from '../../support/logs';

const MEMORY: MemoryReading = {
  totalBytes: 16e9,
  availableBytes: 4e9,
  freeBytes: 1e9,
  cachedBytes: 2e9,
  swapUsedBytes: 1e9,
  swapTotalBytes: 4e9,
};

const DISKS: DiskReading[] = [
  {
    mount: 'C:\\',
    device: 'C:',
    label: 'System',
    filesystem: 'NTFS',
    usedBytes: 400e9,
    totalBytes: 500e9,
    readRate: 10,
    writeRate: 20,
  },
  {
    mount: 'D:\\',
    device: 'D:',
    label: null,
    filesystem: 'NTFS',
    usedBytes: 10e9,
    totalBytes: 100e9,
    readRate: 0,
    writeRate: 0,
  },
];

const BATTERY: Battery = {
  level: 60,
  state: 'charging',
  pluggedIn: true,
  minutesLeft: null,
  healthPercent: null,
  drawWatts: null,
};

interface Rig {
  readonly computer: PortableComputer;
  readonly counters: { received: number; sent: number };
  readonly clock: { now: number };
  readonly stopped: () => boolean;
}

function rig(options: { battery?: Battery | null; fail?: boolean } = {}): Rig {
  const counters = { received: 1_000_000, sent: 100_000 };
  const clock = { now: 0 };
  let stopped = false;
  const readings: PlatformReadings = {
    identity: () =>
      Promise.resolve({
        osName: 'Microsoft Windows 11 Pro',
        vendor: 'LENOVO',
        product: '21CB',
        portable: false,
      }),
    memory: () =>
      options.fail === true ? Promise.reject(new Error('cim down')) : Promise.resolve(MEMORY),
    disks: () => Promise.resolve(DISKS),
    interfaces: (): Promise<InterfaceReading[]> =>
      Promise.resolve([
        {
          name: 'Ethernet',
          kind: 'ethernet',
          state: 'up',
          speedMbps: 1000,
          receivedBytes: counters.received,
          sentBytes: counters.sent,
        },
      ]),
    battery: () => Promise.resolve(options.battery ?? null),
    processCount: () => Promise.resolve(210),
    stop: () => {
      stopped = true;
    },
  };
  const computer = new PortableComputer({
    machineId: 'a'.repeat(32),
    platform: 'win32',
    readings,
    now: (): number => clock.now,
  });
  return { computer, counters, clock, stopped: (): boolean => stopped };
}

function tick(at: number): Tick {
  return { at, key: false };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('the readings of a Windows or Mac computer', () => {
  it('says hello with the system name, the real machine id and the readings it offers', async () => {
    captureLogs();
    const { computer } = rig();
    const hello = await computer.hello(new Date('2026-10-18T10:00:00Z'));
    expect(hello).toMatchObject({
      machineId: 'a'.repeat(32),
      os: { name: 'Microsoft Windows 11 Pro' },
      hardware: { vendor: 'LENOVO', product: '21CB', portable: false },
      features: ['cpu', 'memory', 'disks', 'network'],
    });
    expect(hello.os.kernel).toContain('not verified yet');
  });

  it('calls a computer with a battery portable and offers the battery reading', async () => {
    captureLogs();
    const { computer } = rig({ battery: BATTERY });
    const hello = await computer.hello(new Date());
    expect(hello.hardware.portable).toBe(true);
    expect(hello.features).toContain('battery');
  });

  it('has a summary at once because hello reads everything first', async () => {
    captureLogs();
    const { computer } = rig({ battery: BATTERY });
    await computer.hello(new Date());
    const summary = computer.readers.summary(tick(1000));
    expect(summary).toMatchObject({
      memoryPercent: 75,
      swapPercent: 25,
      fullestDisk: { mount: 'C:\\', percent: 80 },
      batteryLevel: 60,
      charging: true,
      processCount: 210,
      gpuLoad: null,
    });
  });

  it('has no summary until the first readings arrived', () => {
    captureLogs();
    const { computer } = rig();
    expect(computer.readers.summary(tick(0))).toBeNull();
  });

  it('turns byte counters into rates over the time between two readings', async () => {
    captureLogs();
    const { computer, counters, clock } = rig();
    await computer.hello(new Date());
    clock.now = 2000;
    counters.received += 4_000;
    counters.sent += 1_000;
    computer.readers.network(tick(2000));
    await settle();
    const network = computer.readers.network(tick(2000));
    expect(network?.downloadRate).toBe(2000);
    expect(network?.uploadRate).toBe(500);
    expect(network?.interfaces[0]).toMatchObject({ name: 'Ethernet', kind: 'ethernet' });
  });

  it('offers the memory, disk and cpu parts with their own figures', async () => {
    captureLogs();
    const { computer } = rig();
    await computer.hello(new Date());
    expect(computer.readers.memory(tick(0))).toMatchObject({
      usedBytes: 12e9,
      availableBytes: 4e9,
      swapTotalBytes: 4e9,
    });
    expect(computer.readers.disks(tick(0))?.disks[1]).toMatchObject({ label: null, device: 'D:' });
    expect(computer.readers.cpu(tick(0))?.cores.length).toBeGreaterThan(0);
  });

  it('keeps every sample topic answered, with empty parts where the system has none', async () => {
    captureLogs();
    const { computer } = rig();
    await computer.hello(new Date());
    expect(computer.readers.gpu(tick(0))).toStrictEqual({ gpus: [] });
    expect(computer.readers.sensors(tick(0))).toStrictEqual({ sensors: [], fans: [] });
    expect(computer.readers.power(tick(0))).toBeNull();
    expect(Object.keys(computer.readers).sort()).toStrictEqual(
      SAMPLE_TOPICS.filter((topic) => topic !== 'processes').sort(),
    );
  });

  it('still says hello when one reading fails and logs that failure once', async () => {
    const logs = captureLogs();
    const { computer } = rig({ fail: true });
    const hello = await computer.hello(new Date());
    expect(hello.features).toContain('disks');
    computer.readers.memory(tick(1));
    await settle();
    computer.readers.memory(tick(2));
    await settle();
    expect(logs.events().filter((event) => event === 'node.read_failed')).toHaveLength(1);
    expect(computer.readers.memory(tick(3))).toBeNull();
    expect(computer.readers.summary(tick(3))).toBeNull();
  });

  it('stops the platform readings when the computer node stops', () => {
    captureLogs();
    const { computer, stopped } = rig();
    computer.stop();
    expect(stopped()).toBe(true);
  });
});
