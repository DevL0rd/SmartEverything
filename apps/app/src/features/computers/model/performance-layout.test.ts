import { describe, expect, it } from 'vitest';
import type { SensorSnapshot } from '@smarteverything/domain';
import { packRows, performanceCards, spareColumns } from './performance-layout';
import { groupOf, sensorWord, sensorsByGroup } from './performance';

const keys = (rows: readonly (readonly { readonly key: string }[])[]): string[][] =>
  rows.map((row) => row.map((card) => card.key));

describe('performance layout', () => {
  it('puts the processor across two of three columns beside the graphics card', () => {
    const rows = packRows(performanceCards(['0']), 3);
    expect(keys(rows)).toEqual([
      ['cpu', 'gpu-0'],
      ['memory', 'temps', 'power'],
    ]);
  });

  it('widens temperatures to take the place of the missing graphics card', () => {
    const rows = packRows(performanceCards([]), 3);
    expect(keys(rows)).toEqual([
      ['cpu', 'memory'],
      ['temps', 'power'],
    ]);
  });

  it('gives the processor a whole row on two columns and stacks everything on one', () => {
    expect(keys(packRows(performanceCards(['0']), 2))).toEqual([
      ['cpu'],
      ['gpu-0', 'memory'],
      ['temps', 'power'],
    ]);
    expect(packRows(performanceCards(['0']), 1).every((row) => row.length === 1)).toBe(true);
  });

  it('shows one graphics card per graphics chip', () => {
    const kinds = performanceCards(['0', '1']).map((card) => card.kind);
    expect(kinds.filter((kind) => kind === 'gpu')).toHaveLength(2);
  });

  it('fills the rows on two columns without a graphics card', () => {
    expect(keys(packRows(performanceCards([], 2), 2))).toEqual([
      ['cpu'],
      ['memory', 'temps'],
      ['power'],
    ]);
  });

  it('counts the columns a row leaves empty', () => {
    const rows = packRows(performanceCards(['0', '1']), 3);
    expect(rows.map((row) => spareColumns(row, 3))).toEqual([0, 0, 2]);
  });
});

describe('sensors', () => {
  const sensor = (
    chip: string,
    celsius: number,
    high: number | null,
    critical: number | null,
  ): SensorSnapshot => ({
    chip,
    label: 'x',
    celsius,
    highCelsius: high,
    criticalCelsius: critical,
  });

  it('groups chips into words a person knows', () => {
    expect(groupOf({ chip: 'coretemp' })).toBe('Processor');
    expect(groupOf({ chip: 'amdgpu' })).toBe('Graphics');
    expect(groupOf({ chip: 'nvme' })).toBe('Drives');
    expect(groupOf({ chip: 'spd5118' })).toBe('Memory');
    expect(groupOf({ chip: 'acpitz' })).toBe('Board');
  });

  it('keeps only the groups that have sensors, in a fixed order', () => {
    const groups = sensorsByGroup([
      sensor('nvme', 40, null, null),
      sensor('coretemp', 50, null, null),
    ]);
    expect(groups.map((entry) => entry.group)).toEqual(['Processor', 'Drives']);
  });

  it('says Hot and Critical from the sensor’s own limits, or 85 degrees without them', () => {
    expect(sensorWord(sensor('nvme', 70, 80, 90))).toBeNull();
    expect(sensorWord(sensor('nvme', 82, 80, 90))).toBe('Hot');
    expect(sensorWord(sensor('nvme', 91, 80, 90))).toBe('Critical');
    expect(sensorWord(sensor('nvme', 86, null, null))).toBe('Hot');
    expect(sensorWord(sensor('nvme', 60, null, null))).toBeNull();
  });
});
