import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ComputerDetail } from '@smarteverything/domain';
import { compactNow } from '../../src/extensions/mcp/tools/computer-compact';

const SENSORS = z.object({
  sensors: z.array(z.object({ label: z.string() })),
  fans: z.array(z.object({ label: z.string() })),
});

const DETAIL: ComputerDetail = {
  deviceId: '00000000-0000-4000-8000-0000000000c1',
  online: true,
  at: '2026-10-17T14:02:00.000Z',
  features: [],
  parts: {
    sensors: {
      sensors: [
        {
          chip: 'dell_smm',
          label: 'cpu_fan',
          celsius: 40,
          highCelsius: null,
          criticalCelsius: null,
        },
        {
          chip: 'pch_cannonlake',
          label: 'pch_cannonlake',
          celsius: 50,
          highCelsius: null,
          criticalCelsius: null,
        },
        {
          chip: 'coretemp',
          label: 'Package id 0',
          celsius: 60,
          highCelsius: 90,
          criticalCelsius: 100,
        },
      ],
      fans: [
        { label: 'cpu_fan', rpm: 1800, maxRpm: null },
        { label: 'mid_fan', rpm: 1200, maxRpm: null },
      ],
    },
  },
  scopes: {
    metrics: true,
    processes: true,
    power: true,
    apps: true,
    system: true,
    files: true,
    screenshots: true,
    ai_power: true,
  },
  actions: [],
  machineActions: [],
  permissions: [],
};

describe('computer tool readings', () => {
  it('says sensors and fans in words, never as raw ids', () => {
    const { parts } = z.object({ parts: z.object({ sensors: SENSORS }) }).parse(compactNow(DETAIL));
    expect(parts.sensors.sensors.map((sensor) => sensor.label)).toEqual([
      'CPU fan',
      'Chipset (Cannon Lake)',
      'Package id 0',
    ]);
    expect(parts.sensors.fans.map((fan) => fan.label)).toEqual(['CPU fan', 'Middle fan']);
  });
});
