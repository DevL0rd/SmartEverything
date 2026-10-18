import { describe, expect, it } from 'vitest';
import type { ComputerParts, ComputerSummary } from '@smarteverything/domain';
import {
  diskSeverity,
  factsLine,
  hotWord,
  hottestOf,
  railSummaryOf,
  rateParts,
  statusOf,
  sustainedAbove,
  uptimeText,
  type StatusInput,
} from './computer-view';

const AWAKE: StatusInput = {
  online: true,
  seenAt: null,
  locked: false,
  hottest: 50,
  throttled: false,
  busy: false,
  battery: null,
};

const SUMMARY: ComputerSummary = {
  cpuLoad: 12.4,
  cpuTemperature: 46,
  memoryPercent: 41,
  swapPercent: null,
  gpuLoad: 60,
  gpuTemperature: 70,
  gpuMemoryPercent: 50,
  cpuWatts: 30,
  gpuWatts: 110,
  downloadRate: 4_400_000,
  uploadRate: 120_000,
  fullestDisk: { mount: '/home', percent: 63 },
  batteryLevel: 78,
  charging: false,
  totalWatts: 140,
  processCount: 412,
  uptimeSeconds: 3 * 86_400 + 600,
};

describe('statusOf', () => {
  it('says Running smoothly when nothing needs attention', () => {
    expect(statusOf(AWAKE)).toEqual({ word: 'Running smoothly', tone: 'positive', offline: false });
  });

  it('puts offline first and keeps the tone neutral', () => {
    const status = statusOf({ ...AWAKE, online: false, locked: true, busy: true });
    expect(status.offline).toBe(true);
    expect(status.tone).toBe('neutral');
    expect(status.word).toBe('Offline');
  });

  it('puts locked before heat, heat before busy and busy before the battery', () => {
    expect(statusOf({ ...AWAKE, locked: true, hottest: 95 }).word).toBe('Locked');
    expect(statusOf({ ...AWAKE, hottest: 95, busy: true }).word).toBe('Running hot');
    expect(statusOf({ ...AWAKE, throttled: true }).word).toBe('Running hot');
    const onBattery = { state: 'discharging', minutesLeft: 130 } as const;
    expect(statusOf({ ...AWAKE, busy: true, battery: onBattery }).word).toBe('Very busy');
    expect(statusOf({ ...AWAKE, battery: onBattery }).word).toBe('On battery · 2 h 10 min left');
  });

  it('says how long a charge takes only when the computer knows', () => {
    expect(statusOf({ ...AWAKE, battery: { state: 'charging', minutesLeft: 40 } }).word).toBe(
      'Charging · full in 40 min',
    );
    expect(statusOf({ ...AWAKE, battery: { state: 'charging', minutesLeft: null } }).word).toBe(
      'Charging',
    );
    expect(statusOf({ ...AWAKE, battery: { state: 'full', minutesLeft: null } }).word).toBe(
      'Running smoothly',
    );
  });
});

describe('sustainedAbove', () => {
  const points = (values: readonly number[]): { t: number; v: number }[] =>
    values.map((v, index) => ({ t: index * 1000, v }));

  it('needs the whole span of readings above the threshold', () => {
    expect(sustainedAbove(points(Array.from({ length: 12 }, () => 95)), 90, 10_000)).toBe(true);
    expect(sustainedAbove(points([95, 95, 95]), 90, 10_000)).toBe(false);
    expect(sustainedAbove(points([95, ...Array.from({ length: 11 }, () => 20)]), 90, 10_000)).toBe(
      false,
    );
    expect(sustainedAbove([], 90, 10_000)).toBe(false);
  });
});

describe('numbers and words', () => {
  it('splits a rate into figure and unit', () => {
    expect(rateParts(4_400_000)).toEqual({ value: '4.4', unit: 'MB/s' });
    expect(rateParts(0)).toEqual({ value: '0', unit: 'B/s' });
  });

  it('writes uptime in the largest whole unit', () => {
    expect(uptimeText(3 * 86_400 + 5)).toBe('3 d');
    expect(uptimeText(5 * 3600 + 59)).toBe('5 h');
    expect(uptimeText(90)).toBe('1 min');
  });

  it('writes the hero facts line from the summary', () => {
    expect(factsLine(SUMMARY)).toBe('46 °C · 140 W · up 3 d');
    expect(factsLine({ ...SUMMARY, cpuTemperature: null, totalWatts: null })).toBe('up 3 d');
  });

  it('picks the hottest of processor and graphics, or nothing', () => {
    expect(hottestOf(SUMMARY)).toBe(70);
    expect(hottestOf({ ...SUMMARY, cpuTemperature: null, gpuTemperature: null })).toBeNull();
    expect(hottestOf(undefined)).toBeNull();
  });

  it('warns about hot and nearly full only past the limits', () => {
    expect(hotWord(84)).toBeNull();
    expect(hotWord(85)).toBe('Hot');
    expect(diskSeverity(63)).toEqual({ word: null, tone: null });
    expect(diskSeverity(88)).toEqual({ word: 'Getting full', tone: 'warning' });
    expect(diskSeverity(98)).toEqual({ word: 'Almost full', tone: 'critical' });
  });
});

describe('railSummaryOf', () => {
  const parts: ComputerParts = {
    summary: SUMMARY,
    session: {
      at: '2026-10-17T10:00:00.000Z',
      user: null,
      locked: false,
      focused: null,
      volume: 42,
      muted: false,
      media: null,
    },
  };

  it('gives each section its live words from the summary and session', () => {
    expect(railSummaryOf('performance', parts)).toBe('12 % CPU');
    expect(railSummaryOf('processes', parts)).toBe('412');
    expect(railSummaryOf('audio', parts)).toBe('42 %');
    expect(railSummaryOf('network', parts)).toBe('↓ 4.4 MB/s');
    expect(railSummaryOf('storage', parts)).toBe('63 % full');
    expect(railSummaryOf('system', parts)).toBe('78 %');
    expect(railSummaryOf('files', parts)).toBeNull();
  });

  it('says Muted and stays empty before the first reading', () => {
    const muted = {
      ...parts,
      session: parts.session === undefined ? undefined : { ...parts.session, muted: true },
    };
    expect(railSummaryOf('audio', muted)).toBe('Muted');
    expect(railSummaryOf('performance', {})).toBeNull();
    expect(railSummaryOf('audio', {})).toBeNull();
  });
});
