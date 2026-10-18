import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { PowerShell } from '../../../src/node/collectors/windows/powershell-session';
import {
  batteryOf,
  interfaceKindOf,
  WindowsReadings,
} from '../../../src/node/collectors/windows/windows-readings';
import { NETWORK_SCRIPT } from '../../../src/node/collectors/windows/windows-scripts';

function shellAnswering(answers: Readonly<Record<string, unknown>>): PowerShell {
  return {
    run: <T>(script: string, schema: z.ZodType<T>): Promise<T> => {
      const answer = Object.entries(answers).find(([key]) => script.includes(key))?.[1];
      return Promise.resolve(schema.parse(answer));
    },
    stop: (): void => undefined,
  };
}

describe('reading a Windows computer', () => {
  it('names the system and calls a laptop chassis portable', async () => {
    const readings = new WindowsReadings(
      shellAnswering({
        Win32_ComputerSystem: {
          osName: 'Microsoft Windows 11 Pro',
          vendor: 'LENOVO',
          product: '21CB',
          chassis: [10],
          batteries: 1,
        },
      }),
    );
    await expect(readings.identity()).resolves.toStrictEqual({
      osName: 'Microsoft Windows 11 Pro',
      vendor: 'LENOVO',
      product: '21CB',
      portable: true,
    });
  });

  it('leaves out a vendor the firmware did not name', async () => {
    const readings = new WindowsReadings(
      shellAnswering({
        Win32_ComputerSystem: {
          osName: 'Microsoft Windows 10 Home',
          vendor: ' ',
          product: '',
          chassis: [3],
          batteries: 0,
        },
      }),
    );
    expect(await readings.identity()).toMatchObject({
      vendor: null,
      product: null,
      portable: false,
    });
  });

  it('turns memory pages into bytes figures and swap into used bytes', async () => {
    const readings = new WindowsReadings(
      shellAnswering({
        Win32_PerfFormattedData_PerfOS_Memory: {
          total: 16e9,
          available: 6e9,
          free: 1e9,
          cached: 4e9,
          swapTotal: 4e9,
          swapFree: 3e9,
        },
      }),
    );
    expect(await readings.memory()).toStrictEqual({
      totalBytes: 16e9,
      availableBytes: 6e9,
      freeBytes: 1e9,
      cachedBytes: 4e9,
      swapTotalBytes: 4e9,
      swapUsedBytes: 1e9,
    });
  });

  it('lists fixed drives with their used space and live rates', async () => {
    const readings = new WindowsReadings(
      shellAnswering({
        Win32_LogicalDisk: [
          {
            device: 'C:',
            label: 'System',
            filesystem: 'NTFS',
            total: 500e9,
            free: 120e9,
            read: 2048,
            write: 512,
          },
          { device: 'D:', label: '', filesystem: '', total: 100e9, free: 100e9, read: 0, write: 0 },
        ],
      }),
    );
    const disks = await readings.disks();
    expect(disks[0]).toStrictEqual({
      mount: 'C:\\',
      device: 'C:',
      label: 'System',
      filesystem: 'NTFS',
      usedBytes: 380e9,
      totalBytes: 500e9,
      readRate: 2048,
      writeRate: 512,
    });
    expect(disks[1]).toMatchObject({ label: null, filesystem: 'unknown' });
  });

  it('reads physical adapters with their byte counters', async () => {
    const readings = new WindowsReadings(
      shellAnswering({
        'Get-NetAdapterStatistics': [
          {
            name: 'Wi-Fi',
            status: 'Up',
            media: 'Native 802.11',
            speed: 866_700_000,
            received: 1000,
            sent: 500,
          },
          {
            name: 'Ethernet',
            status: 'Disconnected',
            media: '802.3',
            speed: 0,
            received: 0,
            sent: 0,
          },
        ],
      }),
    );
    expect(await readings.interfaces()).toStrictEqual([
      {
        name: 'Wi-Fi',
        kind: 'wifi',
        state: 'up',
        speedMbps: 867,
        receivedBytes: 1000,
        sentBytes: 500,
      },
      {
        name: 'Ethernet',
        kind: 'ethernet',
        state: 'down',
        speedMbps: null,
        receivedBytes: 0,
        sentBytes: 0,
      },
    ]);
    expect(NETWORK_SCRIPT).toContain('Get-NetAdapter -Physical');
  });

  it('counts the running programs', async () => {
    const readings = new WindowsReadings(shellAnswering({ Processes: 187 }));
    await expect(readings.processCount()).resolves.toBe(187);
  });
});

describe('the Windows battery', () => {
  it('reports no battery for a desktop', () => {
    expect(batteryOf(null)).toBeNull();
  });

  it.each([
    [1, 'discharging'],
    [2, 'idle'],
    [3, 'full'],
    [6, 'charging'],
    [11, 'unknown'],
  ] as const)('maps the status code %s to %s', (status, state) => {
    expect(batteryOf({ level: 80, status, minutes: 90 })?.state).toBe(state);
  });

  it('shows the runtime left only while discharging and when Windows knows it', () => {
    expect(batteryOf({ level: 50, status: 1, minutes: 95 })?.minutesLeft).toBe(95);
    expect(batteryOf({ level: 50, status: 1, minutes: 71_582_788 })?.minutesLeft).toBeNull();
    expect(batteryOf({ level: 50, status: 6, minutes: 95 })?.minutesLeft).toBeNull();
  });

  it('keeps the level within 0 to 100', () => {
    expect(batteryOf({ level: 140, status: 3, minutes: 0 })?.level).toBe(100);
  });
});

describe('telling adapters apart', () => {
  it.each([
    ['Native 802.11', 'Wi-Fi', 'wifi'],
    ['802.3', 'Ethernet 2', 'ethernet'],
    ['', 'Bluetooth Network', 'other'],
  ] as const)('reads media %j named %j as %s', (media, name, kind) => {
    expect(interfaceKindOf(media, name)).toBe(kind);
  });
});
