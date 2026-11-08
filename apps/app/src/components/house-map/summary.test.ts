import { describe, expect, it } from 'vitest';
import type { RenderRoom } from './render-scene';
import { describeHomeMapStage, spokenList, type HomeMapSummaryLive } from './summary';

function room(id: string, name: string, hidden = false): RenderRoom {
  return {
    id,
    name,
    homeRoomId: null,
    polygons: [],
    labelAt: { x: 0, y: 0 },
    colourSlot: 1,
    floor: { status: 'none' },
    wallPaint: null,
    ceilingHeight: 2.5,
    areaM2: 10,
    hidden,
  };
}

const FLOOR = {
  name: 'Ground floor',
  rooms: [
    room('k', 'Kitchen'),
    room('h', 'Hall'),
    room('l', 'Living room'),
    room('b', 'Bedroom'),
    room('x', 'Hidden', true),
  ],
};

const LIVE: HomeMapSummaryLive = {
  lightsOn: ['h', 'k', 'x'],
  people: new Map([
    ['l', 1],
    ['b', 0],
  ]),
  temperatures: new Map([['b', '26']]),
};

describe('home map stage summary', () => {
  it('reads the floor, the rooms and the live state in room order', () => {
    expect(describeHomeMapStage(FLOOR, 'Home', LIVE)).toBe(
      'Home map, Ground floor, 4 rooms, lights on in Kitchen and Hall, 1 person in Living room, 26 degrees in Bedroom',
    );
  });

  it('says no lights on, counts people and leaves out live words without live data', () => {
    const quiet = { lightsOn: [], people: new Map([['k', 2]]), temperatures: new Map() };
    expect(describeHomeMapStage(FLOOR, 'Cabin', quiet)).toBe(
      'Cabin map, Ground floor, 4 rooms, no lights on, 2 people in Kitchen',
    );
    expect(describeHomeMapStage({ name: 'First floor', rooms: [] }, null, null)).toBe(
      'Home map, First floor, no rooms',
    );
  });

  it('joins spoken lists with commas and a final and', () => {
    expect(spokenList([])).toBe('');
    expect(spokenList(['A'])).toBe('A');
    expect(spokenList(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
