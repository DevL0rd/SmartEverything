import { describe, expect, it } from 'vitest';
import { lightsToggleOf, type RoomSummary } from './rooms';

function room(overrides: Partial<RoomSummary>): RoomSummary {
  return {
    id: 'room-1',
    name: 'Room 1',
    devices: 4,
    on: 0,
    offline: 0,
    lights: 3,
    lightsOn: 0,
    members: [],
    ...overrides,
  };
}

describe('lightsToggleOf', () => {
  it('has no toggle for a room without lights', () => {
    expect(lightsToggleOf(room({ lights: 0 }))).toBeNull();
  });

  it('turns the lights on when none is on', () => {
    expect(lightsToggleOf(room({ lightsOn: 0 }))).toEqual({
      label: 'Turn on lights in Room 1',
      failure: 'The lights in Room 1 weren’t changed',
      target: { kind: 'room', roomId: 'room-1', families: ['light'] },
      on: true,
    });
  });

  it('turns every light off when at least one is on', () => {
    const toggle = lightsToggleOf(room({ lightsOn: 1 }));
    expect(toggle?.on).toBe(false);
    expect(toggle?.label).toBe('Turn off lights in Room 1');
  });
});
