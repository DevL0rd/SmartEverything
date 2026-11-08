import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { findAction, findEvent, findProperty, type VacuumProperty } from '../src';
import { fixtureJson } from './vacuum-support';

const READING = z.object({ siid: z.number(), piid: z.number(), value: z.unknown() });
const READINGS = z.array(READING);
const PUSHES = z.object({
  properties: z.array(READING.extend({ tMs: z.number() })),
  events: z.array(
    z.object({
      tMs: z.number(),
      siid: z.number(),
      eiid: z.number(),
      arguments: z.array(z.unknown()),
    }),
  ),
});
const ACTION_RESULTS = z.array(
  z.object({
    siid: z.number(),
    aiid: z.number(),
    in: z.array(z.unknown()),
    code: z.number(),
    out: z.array(z.object({ piid: z.number(), value: z.unknown() })),
  }),
);
const TIMELINE = z.array(
  z.object({
    tMs: z.number(),
    siid: z.number(),
    piid: z.number().optional(),
    eiid: z.number().optional(),
    value: z.unknown().optional(),
  }),
);

const INTEGER_BOUNDS: Readonly<Record<string, readonly [number, number]>> = {
  uint8: [0, 255],
  uint16: [0, 65535],
  uint32: [0, 4294967295],
  int32: [-2147483648, 2147483647],
};

function conforms(property: VacuumProperty, value: unknown): boolean {
  if (property.format === null) return true;
  if (property.format === 'bool') return typeof value === 'boolean';
  if (property.format === 'string') return typeof value === 'string';
  const bounds = INTEGER_BOUNDS[property.format];
  if (typeof value !== 'number' || !Number.isInteger(value) || bounds === undefined) return false;
  const [low, high] = property.range === null ? bounds : [property.range[0], property.range[1]];
  return value >= low && value <= high;
}

function address(siid: number, piid: number): string {
  return `${String(siid)}.${String(piid)}`;
}

describe('the live pv11gl fixtures', () => {
  it('read every spec property and every hidden property, each matching its catalog format and range', () => {
    const readings = READINGS.parse(fixtureJson('pv11gl-readings.json'));
    expect(readings).toHaveLength(191);
    const misfits = readings.flatMap((reading) => {
      const entry = findProperty(reading.siid, reading.piid);
      return entry !== null && conforms(entry, reading.value)
        ? []
        : [address(reading.siid, reading.piid)];
    });
    expect(misfits).toEqual([]);
  });

  it('keep to the value lists of the catalog, except edge-sweep-frequency, which reads 0', () => {
    const readings = READINGS.parse(fixtureJson('pv11gl-readings.json'));
    const unknown = readings.flatMap((reading) => {
      const entry = findProperty(reading.siid, reading.piid);
      const values = entry?.values ?? [];
      const listed = values.map((option) => option.value);
      return values.length === 0 ||
        entry?.access.length === 0 ||
        listed.includes(Number(reading.value))
        ? []
        : [address(reading.siid, reading.piid)];
    });
    expect(unknown).toEqual(['2.68']);
  });

  it('record pushes of catalogued properties and the sweep-complete event', () => {
    const pushes = PUSHES.parse(fixtureJson('pv11gl-pushes.json'));
    expect(pushes.properties.length).toBeGreaterThan(90);
    expect(
      pushes.properties.every((push) => findProperty(push.siid, push.piid)?.live.pushed === true),
    ).toBe(true);
    expect(pushes.events.length).toBeGreaterThan(0);
    expect(
      pushes.events.every((event) => findEvent(event.siid, event.eiid)?.live.pushed === true),
    ).toBe(true);
  });

  it('follow a state machine whose status values are all mapped to a proposed state', () => {
    const timeline = TIMELINE.parse(fixtureJson('pv11gl-status-timeline.json'));
    const mapped = (findProperty(2, 2)?.capability?.valueMap ?? []).map((item) => item.value);
    const statuses = timeline.filter((step) => step.siid === 2 && step.piid === 2);
    expect(statuses.length).toBeGreaterThan(5);
    expect(statuses.every((step) => mapped.includes(Number(step.value)))).toBe(true);
    expect(timeline.map((step) => step.tMs)).toEqual(
      [...timeline.map((step) => step.tMs)].sort((a, b) => a - b),
    );
    expect(timeline.some((step) => step.siid === 2 && step.eiid === 2)).toBe(true);
  });

  it('answer actions the catalog holds, with outputs the catalog declares', () => {
    const results = ACTION_RESULTS.parse(fixtureJson('pv11gl-action-results.json'));
    expect(results.length).toBeGreaterThan(10);
    for (const result of results) {
      const entry = findAction(result.siid, result.aiid);
      expect(entry?.live?.accepted).toBe(true);
      expect(result.code).toBe(0);
      expect(result.out.every((item) => entry?.outputs.includes(item.piid) === true)).toBe(true);
    }
  });

  it('hold no account number or cloud object name', () => {
    const files = ['readings', 'pushes', 'status-timeline', 'action-results'];
    const text = files.map((name) => JSON.stringify(fixtureJson(`pv11gl-${name}.json`))).join('\n');
    expect(text).not.toMatch(/\d{8,}\/\d+\/\d+/);
    expect(text).toContain('{uid}/');
    expect(text).not.toMatch(/(?:[0-9a-f]{2}:){5}[0-9a-f]{2}|\b[0-9a-f]{32}\b|192\.168\./i);
  });
});
