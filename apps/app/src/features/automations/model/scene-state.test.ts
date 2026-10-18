import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCENE,
  capturedActions,
  changeScene,
  readScene,
  reordered,
  validateScene,
  type SceneChange,
  type SceneDraft,
} from './scene-state';
import { DEVICES, LAMP, PURIFIER, lamp, purifier } from './test-devices';

const DIM = { type: 'command', deviceId: LAMP, capability: 'brightness', value: 10 } as const;
const OFF = { type: 'command', deviceId: PURIFIER, capability: 'power', value: false } as const;

function apply(...changes: SceneChange[]): SceneDraft {
  return changes.reduce(changeScene, EMPTY_SCENE);
}

describe('the scene draft', () => {
  it('renames, picks an icon and edits its settings', () => {
    const draft = apply(
      { type: 'rename', name: 'Movie night' },
      { type: 'icon', icon: 'film' },
      { type: 'add', actions: [DIM, OFF] },
      { type: 'move', index: 1, by: -1 },
      { type: 'set', index: 1, action: { ...DIM, value: 5 } },
      { type: 'remove', index: 0 },
    );
    expect(draft).toEqual({ name: 'Movie night', icon: 'film', actions: [{ ...DIM, value: 5 }] });
  });

  it('replaces a device’s settings with what was captured and keeps the others', () => {
    const draft = apply(
      { type: 'add', actions: [DIM, OFF] },
      {
        type: 'capture',
        captured: [{ ...DIM, value: 70 }],
      },
    );
    expect(draft.actions).toEqual([OFF, { ...DIM, value: 70 }]);
  });
});

describe('capturing the current state', () => {
  it('takes every readable and writable setting whose value the device accepts', () => {
    expect(
      capturedActions(lamp, {
        power: { value: true },
        brightness: { value: 64 },
        color: { value: 'not a colour' },
      }),
    ).toEqual([
      { type: 'command', deviceId: LAMP, capability: 'power', value: true },
      { type: 'command', deviceId: LAMP, capability: 'brightness', value: 64 },
    ]);
  });

  it('skips readings, actions and devices without state', () => {
    expect(
      capturedActions(purifier, { pm25: { value: 12 }, filter_reset: { value: null } }),
    ).toEqual([]);
    expect(capturedActions(purifier, undefined)).toEqual([]);
  });
});

describe('reading and validating scenes', () => {
  it('reads stored actions and explains unreadable ones', () => {
    expect(readScene({ name: 'Movie night', icon: 'film', actions: [DIM] })).toEqual({
      readable: true,
      draft: { name: 'Movie night', icon: 'film', actions: [DIM] },
    });
    const old = readScene({ name: 'Old', icon: 'film', actions: [{ type: 'scene' }] });
    expect(old.readable).toBe(false);
    if (!old.readable) {
      expect(old.problem).toMatch(/^The saved actions of Old cannot be read: 0\./);
    }
  });

  it('accepts a named scene with valid settings', () => {
    expect(validateScene({ name: ' Movie ', icon: 'film', actions: [DIM] }, DEVICES)).toEqual({
      valid: true,
      scene: { name: 'Movie', icon: 'film', actions: [DIM] },
    });
  });

  it('lists every problem in plain words', () => {
    const gone = '30000000-0000-4000-8000-000000000001';
    expect(validateScene(EMPTY_SCENE, DEVICES)).toEqual({
      valid: false,
      problems: { name: ['Give it a name.'], steps: ['Add at least one device.'] },
    });
    expect(
      validateScene(
        {
          name: 'y'.repeat(81),
          icon: 'film',
          actions: [{ ...DIM, deviceId: gone }, { ...DIM, value: 900 }, DIM],
        },
        DEVICES,
      ),
    ).toEqual({
      valid: false,
      problems: {
        name: ['Use at most 80 characters.'],
        steps: [
          '1. uses a device that is no longer here',
          '2. Expected a number value: outside 1 to 100. Received 900.',
          '3. sets the same thing twice',
        ],
      },
    });
  });
});

describe('ordering scenes', () => {
  const scenes = [
    { id: 'a', position: 0 },
    { id: 'b', position: 1 },
    { id: 'c', position: 2 },
  ];

  it('swaps a scene with its neighbour and returns the whole new order', () => {
    expect(reordered(scenes, 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(reordered(scenes, 'a', 1)).toEqual(['b', 'a', 'c']);
  });

  it('returns nothing when the scene is already at that end', () => {
    expect(reordered(scenes, 'a', -1)).toBeNull();
    expect(reordered(scenes, 'c', 1)).toBeNull();
  });
});
