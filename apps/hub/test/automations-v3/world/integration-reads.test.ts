import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SignalInput } from '@smarteverything/domain';
import { createWorldReads } from '../../../src/automations/world-v3/world-reads';
import { SCOPE, furnish, type Home } from './support';
import { forecastOf } from './forecast';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

describe('var.secret', () => {
  it('hands out the secret id and nothing else', () => {
    expect(home.read('var.secret', { secret: 'secret-1' }).outputs).toEqual({ secret: 'secret-1' });
  });
});

describe('computer.read and phone.read', () => {
  it('reads the figures the machine reports and leaves out the rest', () => {
    home.write(home.sensor, 'locked', true);
    home.write(home.sensor, 'battery_level', 80);
    const { outputs } = home.read('computer.read', { computer: { computer: home.sensor.id } });
    expect(outputs).toEqual({ locked: true, batteryLevel: 80 });
  });

  it('reads a phone the same way', () => {
    home.write(home.motion, 'ringer_mode', 'silent');
    home.write(home.motion, 'dnd', true);
    expect(home.read('phone.read', { phone: home.motion.id }).outputs).toEqual({
      ringerMode: 'silent',
      dnd: true,
    });
  });

  it('fails for a machine that does not exist', () => {
    expect(() => home.read('phone.read', { phone: 'nope' })).toThrow(/no device nope/);
    expect(() => home.read('computer.read', {})).toThrow(/needs a computer/);
  });
});

describe('weather.forecast', () => {
  function seed(): void {
    home.test.store.weather.fetched({
      forecast: forecastOf(),
      airError: null,
      nextFetchAt: '2026-10-18T13:00:00.000Z',
    });
  }

  it('summarises the next hours', () => {
    seed();
    expect(home.read('weather.forecast', { hours: 3, rainAbove: 50 }).outputs).toEqual({
      rainChance: 70,
      rainHours: 1,
      minTemperature: 20,
      maxTemperature: 20,
      maxWind: 5,
      todayMin: 8,
      todayMax: 16,
    });
  });

  it('looks only as far ahead as asked', () => {
    seed();
    expect(home.read('weather.forecast', { hours: 1, rainAbove: 50 }).outputs).toMatchObject({
      rainChance: 30,
      rainHours: 0,
    });
  });

  it('gives nothing before a forecast has been fetched', () => {
    expect(home.read('weather.forecast', { hours: 3, rainAbove: 50 }).outputs).toEqual({});
  });
});

describe('signal.latest', () => {
  const signal = (value: number, at: string): SignalInput => ({
    source: 'device',
    kind: 'state',
    subject: 'lamp',
    field: 'brightness',
    value,
    previous: value - 1,
    at,
    profileId: null,
    data: { room: 'kitchen' },
  });

  it('reads the newest matching signal', () => {
    const seen = [signal(5, '2026-10-18T11:00:00.000Z'), signal(9, '2026-10-18T11:30:00.000Z')];
    const reads = createWorldReads({
      ...home.deps,
      signals: { latest: () => seen.toReversed() },
    });
    const { outputs } = reads.read('signal.latest', { source: 'device', kind: 'state' }, SCOPE);
    expect(outputs).toEqual({
      found: true,
      value: 9,
      previous: 8,
      subject: 'lamp',
      at: '2026-10-18T11:30:00.000Z',
      data: { room: 'kitchen' },
    });
  });

  it('says when nothing was seen', () => {
    expect(home.read('signal.latest', { source: 'device', kind: 'state' }).outputs).toEqual({
      found: false,
    });
  });
});
