import { VACUUM_MAP_KEY, VACUUM_POSE_KEY, VacuumValueError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { parseLivePose, parseMapVersion, parsePose } from './map-feed';

describe('map version', () => {
  it('reads the version the hub publishes', () => {
    expect(parseMapVersion('1520:current')).toStrictEqual({
      version: '1520:current',
      index: 1520,
      slot: 'current',
    });
    expect(parseMapVersion('0:backup')?.slot).toBe('backup');
  });

  it('has no map before the hub published one', () => {
    expect(parseMapVersion(undefined)).toBeNull();
    expect(parseMapVersion('')).toBeNull();
  });

  it('names a version it cannot read', () => {
    for (const bad of ['current', '12', '12:other', '-1:current', 7, null]) {
      expect(() => parseMapVersion(bad)).toThrow(VacuumValueError);
    }
  });

  it('uses the capability keys the hub publishes', () => {
    expect([VACUUM_MAP_KEY, VACUUM_POSE_KEY]).toStrictEqual(['raw:vacuum_map', 'raw:vacuum_pose']);
  });
});

describe('robot pose', () => {
  it('reads the pose and ignores the route cursor', () => {
    expect(parsePose(JSON.stringify({ x: 1.5, y: -2, yaw: 0.3, cursor: 12 }))).toStrictEqual({
      x: 1.5,
      y: -2,
      yaw: 0.3,
    });
  });

  it('has no pose when the hub published an empty one', () => {
    expect(parsePose('')).toBeNull();
    expect(parsePose(undefined)).toBeNull();
  });

  it('names a pose it cannot read', () => {
    for (const bad of ['{', '[]', JSON.stringify({ x: 1, y: 2 }), 5]) {
      expect(() => parsePose(bad)).toThrow(VacuumValueError);
    }
  });
});

describe('live pose', () => {
  it('reads the pose with the route cursor', () => {
    expect(parseLivePose(JSON.stringify({ x: 1.5, y: -2, yaw: 0.3, cursor: 12 }))).toStrictEqual({
      x: 1.5,
      y: -2,
      yaw: 0.3,
      cursor: 12,
    });
  });

  it('has no live pose when the hub published an empty one', () => {
    expect(parseLivePose('')).toBeNull();
    expect(parseLivePose(undefined)).toBeNull();
  });

  it('names a live pose without a usable cursor', () => {
    for (const bad of [
      JSON.stringify({ x: 1, y: 2, yaw: 0 }),
      JSON.stringify({ x: 1, y: 2, yaw: 0, cursor: -1 }),
      JSON.stringify({ x: 1, y: 2, yaw: 0, cursor: 1.5 }),
    ]) {
      expect(() => parseLivePose(bad)).toThrow(VacuumValueError);
    }
  });
});
