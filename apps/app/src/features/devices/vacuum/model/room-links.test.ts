import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  VACUUM_SCENE_ANSWER,
  VacuumValueError,
  type VacuumRoomLinks,
} from '@smarteverything/domain';
import {
  linkChoicesOf,
  linkFieldOf,
  linkNoticeOf,
  holderLine,
  moveBody,
  parseRoomLinksSummary,
  pickerRowsOf,
} from './room-links';
import { shownSceneOf } from './room-names';

const FIXTURE: unknown = JSON.parse(
  readFileSync(new URL('scene-geometry.fixture.json', import.meta.url), 'utf8'),
);

const KITCHEN = { id: 'room-kitchen', name: 'Kitchen' };
const HALLWAY = { id: 'room-hall', name: 'Hallway' };
const OFFICE = { id: 'room-office', name: 'Office' };

function links(): VacuumRoomLinks {
  return {
    mapIndex: 7,
    rooms: [
      {
        mapRoomId: 3,
        mapRoomName: 'Kitchen',
        colour: 1,
        areaM2: 12,
        homeRoom: KITCHEN,
        suggestion: null,
      },
      {
        mapRoomId: 4,
        mapRoomName: 'Hall',
        colour: 2,
        areaM2: 11,
        homeRoom: null,
        suggestion: HALLWAY,
      },
      {
        mapRoomId: 5,
        mapRoomName: 'Study',
        colour: 3,
        areaM2: 9,
        homeRoom: null,
        suggestion: null,
      },
      {
        mapRoomId: 6,
        mapRoomName: 'Cook',
        colour: 0,
        areaM2: 4,
        homeRoom: null,
        suggestion: KITCHEN,
      },
    ],
    stale: [],
    homeRooms: [
      { ...KITCHEN, usedBy: { mapRoomId: 3, mapRoomName: 'Kitchen', stale: false } },
      { ...HALLWAY, usedBy: null },
      { ...OFFICE, usedBy: null },
    ],
    unlinked: 3,
  };
}

describe('the room links value', () => {
  it('reads the counts the hub publishes and nothing when it has none', () => {
    expect(parseRoomLinksSummary('{"linked":2,"unlinked":3,"stale":1}')).toStrictEqual({
      linked: 2,
      unlinked: 3,
      stale: 1,
    });
    expect(parseRoomLinksSummary(undefined)).toBeNull();
    expect(parseRoomLinksSummary('')).toBeNull();
  });

  it('reads the revision when present and an older hub value without it', () => {
    expect(parseRoomLinksSummary('{"linked":2,"unlinked":3,"stale":1,"revision":4}')).toStrictEqual(
      { linked: 2, unlinked: 3, stale: 1, revision: 4 },
    );
    expect(parseRoomLinksSummary('{"linked":2,"unlinked":3,"stale":1}')?.revision).toBeUndefined();
  });

  it('names the value and what it expected when the text is not the counts', () => {
    expect(() => parseRoomLinksSummary('{"linked":"two"}')).toThrow(VacuumValueError);
    expect(() => parseRoomLinksSummary('not json')).toThrow(/linked, unlinked and stale/u);
    expect(() => parseRoomLinksSummary(4)).toThrow(VacuumValueError);
  });
});

describe('the link notice', () => {
  it('counts the unlinked rooms first, then the links whose room left the map', () => {
    expect(linkNoticeOf({ linked: 2, unlinked: 3, stale: 1 })?.count).toBe(3);
    expect(linkNoticeOf({ linked: 2, unlinked: 1, stale: 0 })?.title).toBe(
      '1 room isn’t linked to your home',
    );
    expect(linkNoticeOf({ linked: 5, unlinked: 0, stale: 2 })?.label).toBe(
      '2 links to check. Link rooms',
    );
  });

  it('says the map changed when a changed map also left rooms to link', () => {
    expect(linkNoticeOf({ linked: 4, unlinked: 1, stale: 1 })?.title).toBe(
      'The robot’s map changed. 1 room to link',
    );
  });

  it('goes away when every map room is linked and nothing is stale', () => {
    expect(linkNoticeOf({ linked: 5, unlinked: 0, stale: 0 })).toBeNull();
    expect(linkNoticeOf(null)).toBeNull();
  });
});

describe('the home room selector on each map room', () => {
  it('shows which map room already uses each home room', () => {
    const forStudy = pickerRowsOf(links().homeRooms, 5);
    expect(forStudy.map((row) => [row.room.name, row.usedBy, row.current])).toStrictEqual([
      ['Kitchen', 'Kitchen', false],
      ['Hallway', null, false],
      ['Office', null, false],
    ]);
    expect(pickerRowsOf(links().homeRooms, 3)[0]).toMatchObject({ current: true, usedBy: null });
  });

  it('puts a free name suggestion on top and leaves it out of the list below', () => {
    const hall = linkChoicesOf(links(), 4);
    expect(hall?.suggestion).toStrictEqual(HALLWAY);
    expect(hall?.rows.map((row) => row.room.name)).toStrictEqual(['Kitchen', 'Office']);
  });

  it('offers no suggestion that another map room already uses, nor for a linked room', () => {
    expect(linkChoicesOf(links(), 6)?.suggestion).toBeNull();
    expect(linkChoicesOf(links(), 6)?.rows).toHaveLength(3);
    expect(linkChoicesOf(links(), 3)?.suggestion).toBeNull();
    expect(linkChoicesOf(links(), 99)).toBeNull();
  });

  it('says what the selector holds and what it does', () => {
    const [kitchen, hall] = links().rooms;
    if (kitchen === undefined || hall === undefined) {
      throw new Error('the links fixture lost its rooms');
    }
    expect(linkFieldOf(kitchen, true)).toStrictEqual({
      icon: 'circleCheck',
      text: 'Linked',
      label: 'Kitchen is linked to Kitchen. Change the home room',
      linked: true,
    });
    expect(linkFieldOf(hall, true).text).toBe('Pick a home room');
    expect(linkFieldOf(hall, false)).toMatchObject({ icon: 'plus', text: 'Create a home room' });
  });

  it('explains a move before it unlinks the other map room', () => {
    expect(moveBody('Kitchen', 'Cook')).toContain('the map room Cook becomes unlinked');
  });

  it('never repeats the room name when the other map room already carries it', () => {
    expect(holderLine('Living room', 'Living room')).toBe('Linked to another map room');
    expect(holderLine('Living room', 'Room 3')).toBe('Linked to the map room Room 3');
    expect(moveBody('Hall', 'Hall')).not.toContain('Hall is linked to Hall');
  });
});

describe('room names across the page', () => {
  it('shows the linked home room name, live from the home, and keeps the robot name', () => {
    const scene = VACUUM_SCENE_ANSWER.parse(FIXTURE);
    const [first, second] = scene.rooms;
    if (first === undefined || second === undefined) {
      throw new Error('The fixture needs two rooms');
    }
    const linked = {
      ...scene,
      rooms: [
        { ...first, homeRoom: { id: 'room-1', name: 'Lounge' } },
        { ...second, homeRoom: null },
      ],
    };
    const shown = shownSceneOf(linked, [{ id: 'room-1', name: 'Living room' }]);
    expect(shown.rooms[0]).toMatchObject({
      name: 'Living room',
      robotName: first.name,
      homeRoomId: 'room-1',
    });
    expect(shown.rooms[1]).toMatchObject({ name: second.name, homeRoomId: null });
    expect(shownSceneOf(linked, []).rooms[0]?.name).toBe('Lounge');
  });
});
