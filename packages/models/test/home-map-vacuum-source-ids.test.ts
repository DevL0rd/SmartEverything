import {
  HOME_MAP_ROBOT_FURNITURE_MODEL_IDS,
  homeMapRobotFurnitureModel,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY } from '../src/index';

const CATALOGUE_IDS = new Set(MODEL_REGISTRY.map((spec) => spec.id));

describe('the robot furniture table against the model library catalogue', () => {
  it('emits only cat ids that exist in the catalogue', () => {
    const missing = HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.filter((id) => !CATALOGUE_IDS.has(id));
    expect(missing).toStrictEqual([]);
  });

  it('emits only ids from the cat namespace', () => {
    expect(HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.every((id) => id.startsWith('cat.'))).toBe(true);
  });

  it('resolves every listed id from some robot furniture kind', () => {
    expect(HOME_MAP_ROBOT_FURNITURE_MODEL_IDS.length).toBeGreaterThan(0);
    expect(homeMapRobotFurnitureModel('toilet')).toBe('cat.bathroom.toilet');
    expect(homeMapRobotFurnitureModel('not_a_robot_kind')).toBeNull();
  });
});
