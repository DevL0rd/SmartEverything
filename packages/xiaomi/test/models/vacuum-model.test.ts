import {
  MODEL_SPEC,
  shownParts,
  specSignalProblems,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { XIAOMI_PV11GL_ROBOT_MODEL as ROBOT } from '../../src/models/vacuum';
import { TURRET_H, TURRET_Y } from '../../src/models/vacuum-parts';
import { XIAOMI_PV11GL_STATION_MODEL as STATION } from '../../src/models/vacuum-station';

function channel(spec: ModelSpec, id: string): NonNullable<ModelSpec['channels']>[number] {
  const found = spec.channels?.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no channel ${id}`);
  return found;
}

function anchor(spec: ModelSpec, id: string): NonNullable<ModelSpec['anchors']>[number] {
  const found = spec.anchors?.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no anchor ${id}`);
  return found;
}

describe('Xiaomi Robot Vacuum 6 Max model', () => {
  it('is a valid spec whose channels and states use known signals', () => {
    expect(MODEL_SPEC.safeParse(ROBOT).success).toBe(true);
    expect(specSignalProblems(ROBOT)).toEqual([]);
  });

  it('is 350 mm across and 90 mm tall with the LiDAR lowered flush', () => {
    expect(ROBOT.footprint).toEqual({ width: 0.35, depth: 0.35, height: 0.09 });
    expect(TURRET_Y + TURRET_H / 2).toBeCloseTo(0.09, 6);
  });

  it('raises the LiDAR only from its own signal', () => {
    const rise = channel(ROBOT, 'turretRise');
    expect(rise.source).toBe('lidarRaised');
    expect(rise.map).toEqual({ type: 'enum', table: { true: 0.02 } });
  });

  it('tilts and lifts when picked up and drops its wheels', () => {
    expect(channel(ROBOT, 'tiltBody')).toMatchObject({ source: 'lifted', property: 'rotate' });
    expect(channel(ROBOT, 'liftBody').source).toBe('lifted');
    expect(channel(ROBOT, 'wheel1Out').source).toBe('lifted');
  });

  it('lowers and spins the mop only in mop modes', () => {
    const lower = channel(ROBOT, 'mopLower');
    expect(lower.source).toBe('cleanMode');
    expect(lower.map).toEqual({ type: 'enum', table: { mop: -0.006, sweep_mop: -0.006 } });
    expect(channel(ROBOT, 'mopSpin').map).toEqual({
      type: 'enum',
      table: { mop: 2, sweep_mop: 2 },
    });
  });

  it('colours the ring for a low battery before the phase colours it', () => {
    const ids = (ROBOT.channels ?? []).map((entry) => entry.id);
    expect(channel(ROBOT, 'ringLowColour').source).toBe('batteryLow');
    expect(ids.indexOf('ringLowColour')).toBeLessThan(ids.indexOf('ringColour'));
    expect(ids.indexOf('ringColour')).toBeLessThan(ids.indexOf('ringFaultColour'));
  });

  it('draws progress as eight arcs that rise in order', () => {
    const rises = (ROBOT.channels ?? []).filter((entry) => /^progressArc\d+Rise$/.test(entry.id));
    expect(rises).toHaveLength(8);
    expect(rises.map((entry) => (entry.map.type === 'linear' ? entry.map.in : null))).toEqual(
      Array.from({ length: 8 }, (_, index) => [index / 8, (index + 1) / 8]),
    );
  });

  it('gives the side brush a hub with three short arms', () => {
    const arms = ROBOT.parts.filter((part) => part.parent === 'sideBrush');
    expect(arms.map((part) => part.geometry.type)).toEqual([
      'roundedBox',
      'roundedBox',
      'roundedBox',
    ]);
    expect(shownParts(ROBOT, 0, {}).map((part) => part.id)).toContain('sideBrush');
  });
});

describe('Xiaomi Omni station model', () => {
  it('is a valid spec whose channels and states use known signals', () => {
    expect(MODEL_SPEC.safeParse(STATION).success).toBe(true);
    expect(specSignalProblems(STATION)).toEqual([]);
  });

  it('has the published 360 x 470 x 582 mm size and a matching hit box', () => {
    expect(STATION.footprint).toEqual({ width: 0.36, depth: 0.47, height: 0.582 });
    expect(anchor(STATION, 'hit')).toMatchObject({ size: [0.36, 0.582, 0.47] });
  });

  it('is a 289 mm deep tower with the ramp in front', () => {
    const tower = STATION.parts.find((part) => part.id === 'tower');
    expect(tower?.geometry).toMatchObject({ width: 0.36, depth: 0.289 });
  });

  it('docks the 350 mm robot fully on the ramp inside the station', () => {
    const ramp = STATION.parts.find((part) => part.id === 'ramp');
    const width = ramp?.geometry.type === 'roundedBox' ? ramp.geometry.width : 0;
    expect(width).toBeGreaterThanOrEqual(0.35);
    const dock = anchor(STATION, 'dock');
    expect(dock.position?.[2]).toBeCloseTo(0.47 / 2 - 0.175, 6);
  });

  it('shows washing, drying and emptying on their own parts', () => {
    expect(channel(STATION, 'trayWarm').map).toMatchObject({ table: { dry: 1.3 } });
    expect(channel(STATION, 'dustLit').target).toBe('dustLight');
    expect(channel(STATION, 'cleanFlow').target).toBe('cleanLevel');
  });

  it('is two-tone with a satin black panel', () => {
    expect(STATION.parts.find((part) => part.id === 'panel')?.material).toBe('trim');
    expect(STATION.materials['trim']?.color).not.toBe(STATION.materials['body']?.color);
  });
});
