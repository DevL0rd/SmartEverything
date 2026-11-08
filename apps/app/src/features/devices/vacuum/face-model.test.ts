import { readFileSync } from 'node:fs';
import {
  VACUUM_PHASES,
  VACUUM_SCENE,
  type VacuumPhase,
  type VacuumRoom,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clock } from '../../../format/time';
import {
  actionsOf,
  awakeDetail,
  batteryText,
  faceProgress,
  faceTiles,
  cameraLive,
  lastCleanLine,
  layoutOf,
  mostWorn,
  mountedView,
} from './face-model';
import { roomChips } from './model/room-selection';

const SCREEN = { visible: true, focused: true, foreground: true } as const;

const scene = VACUUM_SCENE.parse(
  JSON.parse(readFileSync(new URL('model/scene-geometry.fixture.json', import.meta.url), 'utf8')),
);

const [template] = scene.rooms;

function room(id: number, hidden = false): VacuumRoom {
  if (template === undefined) {
    throw new Error('The scene fixture has no rooms');
  }
  return { ...template, id, name: `Room ${String(id)}`, hidden };
}

describe('layoutOf', () => {
  it('picks one layout per widget frame class', () => {
    expect(layoutOf('xs')).toBe('row');
    expect(layoutOf('s')).toBe('tile');
    expect(layoutOf('m')).toBe('row');
    expect(layoutOf('w')).toBe('row');
    expect(layoutOf('l')).toBe('stack');
    expect(layoutOf('xl')).toBe('side');
  });
});

describe('actionsOf', () => {
  it('offers pause and dock while cleaning or mopping', () => {
    for (const phase of ['cleaning', 'mopping'] as const) {
      const actions = actionsOf(phase, true, 0);
      expect(actions.primary?.command).toBe('pause');
      expect(actions.dock?.command).toBe('dock');
    }
  });

  it('offers resume and dock when paused, and resume alone when mapping is paused', () => {
    expect(actionsOf('paused', true, 0).primary?.command).toBe('resume');
    expect(actionsOf('paused', true, 0).dock?.command).toBe('dock');
    expect(actionsOf('mapping_paused', true, 0).primary?.command).toBe('resume');
    expect(actionsOf('mapping_paused', true, 0).dock).toBeNull();
  });

  it('offers start on the dock and cleans the chosen rooms when some are chosen', () => {
    for (const phase of ['idle', 'docked_full', 'charging'] as const) {
      expect(actionsOf(phase, true, 0)).toMatchObject({
        primary: { id: 'start', label: 'Start', command: 'start' },
        cleanRooms: false,
      });
    }
    expect(actionsOf('charging', true, 1)).toMatchObject({
      primary: { label: 'Clean 1 room' },
      cleanRooms: true,
    });
    expect(actionsOf('charging', true, 3).primary?.label).toBe('Clean 3 rooms');
  });

  it('offers nothing while offline, unknown, in error or busy with the station', () => {
    expect(actionsOf('cleaning', false, 0)).toStrictEqual({
      primary: null,
      dock: null,
      cleanRooms: false,
    });
    expect(actionsOf(null, true, 0).primary).toBeNull();
    for (const phase of [
      'error',
      'returning',
      'washing_mop',
      'station_busy',
      'updating',
    ] as const) {
      expect(actionsOf(phase, true, 0).primary).toBeNull();
    }
    expect(actionsOf('error', true, 0).dock?.id).toBe('dock');
    expect(actionsOf('returning', true, 0).dock).toBeNull();
  });

  it('builds the wide face tiles from the job while awake and the next clean and wear at rest', () => {
    expect(
      faceTiles({
        awake: true,
        doneAreaM2: 12.4,
        elapsedSeconds: 1080,
        nextClean: 'Mon 26 Oct',
        worn: null,
      }),
    ).toStrictEqual([
      { label: 'Area', value: '12 m²' },
      { label: 'Time', value: '18 min' },
    ]);
    expect(
      faceTiles({
        awake: false,
        doneAreaM2: 3,
        elapsedSeconds: 60,
        nextClean: 'Mon 26 Oct',
        worn: { label: 'Filter', lifePercent: 12.4 },
      }),
    ).toStrictEqual([
      { label: 'Next clean', value: 'Mon 26 Oct' },
      { label: 'Filter', value: '12% left' },
    ]);
  });

  it('names the part with the least life left and skips parts that report none', () => {
    expect(
      mostWorn([
        { label: 'Main brush', lifePercent: 64 },
        { label: 'Filter', lifePercent: null },
        { label: 'Side brush', lifePercent: 21 },
      ]),
    ).toStrictEqual({ label: 'Side brush', lifePercent: 21 });
    expect(mostWorn([{ label: 'Filter', lifePercent: null }])).toBeNull();
  });

  it('drives the face progress from the station while it works, else from the job', () => {
    expect(faceProgress(true, 0.4, 10)).toBe(0.4);
    expect(faceProgress(true, null, 58)).toBe(0.58);
    expect(faceProgress(false, null, 58)).toBeNull();
    expect(awakeDetail('Kitchen', 1080)).toBe('Kitchen · 18 min');
    expect(awakeDetail(null, null)).toBeNull();
  });

  it('never sends a command the cleaning capability does not list', () => {
    const phases: readonly (VacuumPhase | null)[] = [...VACUUM_PHASES, null];
    for (const phase of phases) {
      const { primary, dock } = actionsOf(phase, true, 2);
      for (const action of [primary, dock]) {
        if (action !== null) {
          expect(['start', 'pause', 'resume', 'dock']).toContain(action.command);
        }
      }
    }
  });
});

describe('mountedView', () => {
  it('mounts the 3D map only when on screen, focused and in the foreground', () => {
    expect(mountedView(SCREEN)).toBe('3d');
    expect(mountedView({ ...SCREEN, visible: false })).toBe('still');
    expect(mountedView({ ...SCREEN, focused: false })).toBe('still');
    expect(mountedView({ ...SCREEN, foreground: false })).toBe('still');
  });
});

describe('cameraLive', () => {
  it('needs the camera option, a tap and a visible, focused, foreground face', () => {
    expect(cameraLive('camera', true, SCREEN)).toBe(true);
    expect(cameraLive('camera', false, SCREEN)).toBe(false);
    expect(cameraLive('3d', true, SCREEN)).toBe(false);
    expect(cameraLive('camera', true, { ...SCREEN, visible: false })).toBe(false);
    expect(cameraLive('camera', true, { ...SCREEN, foreground: false })).toBe(false);
    expect(cameraLive('camera', true, { ...SCREEN, focused: false })).toBe(false);
  });
});

describe('lastCleanLine', () => {
  it('words when, how much and how long', () => {
    const startedAt = '2026-10-24T09:14:00.000Z';
    const now = Date.parse('2026-10-24T12:00:00.000Z');
    expect(lastCleanLine({ startedAt, areaM2: 41.6, seconds: 2280 }, now, 'UTC')).toBe(
      `Last clean today ${clock(startedAt, 'UTC')} · 42 m² · 38 min`,
    );
  });

  it('is empty without a clean', () => {
    expect(lastCleanLine(null, 0, null)).toBeNull();
  });
});

describe('room chips on the face', () => {
  it('offers every visible room in id order with the pick order and the current room', () => {
    const rooms = [9, 3, 1, 2, 4, 5, 6, 7, 8].map((id) => room(id));
    const chips = roomChips([...rooms, room(20, true)], [3], 1);
    expect(chips.map((chip) => chip.id)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(chips[2]).toMatchObject({ selected: true, order: 1 });
    expect(chips[0]).toMatchObject({ now: true });
  });
});

describe('batteryText', () => {
  it('rounds the percent', () => {
    expect(batteryText(63.6)).toBe('64%');
    expect(batteryText(null)).toBeNull();
  });
});
