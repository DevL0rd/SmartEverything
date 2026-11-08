import { describe, expect, it } from 'vitest';
import { DEFAULT_FACE_OPTIONS, VIEW_CHOICES, faceOptionsOf } from './face-options';

describe('faceOptionsOf', () => {
  it('shows the 3D map when the widget has no main view yet', () => {
    expect(faceOptionsOf(undefined)).toStrictEqual(DEFAULT_FACE_OPTIONS);
    expect(faceOptionsOf({ deviceId: 'a' })).toStrictEqual({ view: '3d' });
  });

  it('reads the chosen main view', () => {
    expect(faceOptionsOf({ deviceId: 'a', vacuumView: '3d' })).toStrictEqual({ view: '3d' });
    expect(faceOptionsOf({ vacuumView: 'camera' })).toStrictEqual({ view: 'camera' });
  });

  it('falls back to the default for an unknown view', () => {
    expect(faceOptionsOf({ vacuumView: 'hologram' })).toStrictEqual(DEFAULT_FACE_OPTIONS);
    expect(faceOptionsOf({ vacuumView: '2d' })).toStrictEqual(DEFAULT_FACE_OPTIONS);
  });
});

describe('the main view choices', () => {
  it('offer the 3D map and the camera', () => {
    expect(VIEW_CHOICES.map((choice) => choice.value)).toStrictEqual(['3d', 'camera']);
    expect(VIEW_CHOICES.map((choice) => choice.label)).toStrictEqual(['3D map', 'Camera']);
  });
});
