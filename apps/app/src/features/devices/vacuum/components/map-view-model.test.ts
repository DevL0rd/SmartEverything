import { readFileSync } from 'node:fs';
import { VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { clock } from '../../../../format/time';
import { describeVacuumMap, planStage, stageStatus, type StageInput } from './map-view-model';

const scene: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(new URL('../model/scene-geometry.fixture.json', import.meta.url), 'utf8'),
  ),
);

const base: StageInput = {
  online: true,
  webgl: true,
  requested: '3d',
  hasMapVersion: true,
  scene,
  unreadable: false,
  lastSeenAt: null,
  timeZone: 'UTC',
  fault: null,
  notAccepted: null,
};

describe('planStage', () => {
  it('keeps 3D selected and draws the still under a note when WebGL is missing', () => {
    const plan = planStage({ ...base, webgl: false });
    expect(plan).toMatchObject({ view: '3d', live3d: false, body: 'map' });
    expect(plan.views).toEqual(['3d', 'camera']);
    expect(plan.notes.map((note) => note.text)).toEqual(["3D isn't available on this device"]);
  });

  it('defaults to the 3D map in every state that has a map', () => {
    const states: readonly Partial<StageInput>[] = [
      {},
      { online: true },
      { online: false },
      { online: false, lastSeenAt: '2026-10-24T14:02:00.000Z' },
      { unreadable: true },
    ];
    for (const state of states) {
      expect(planStage({ ...base, ...state })).toMatchObject({ view: '3d', live3d: true });
    }
  });

  it('keeps the chosen view while the robot goes offline and comes back', () => {
    for (const requested of ['3d', 'camera'] as const) {
      expect(planStage({ ...base, requested, online: false }).view).toBe(requested);
      expect(planStage({ ...base, requested }).view).toBe(requested);
    }
  });

  it('shows the live 3D map for an awake, reachable robot', () => {
    const plan = planStage(base);
    expect(plan).toMatchObject({ body: 'map', view: '3d', live3d: true, dimmed: false });
    expect(plan.views).toEqual(['3d', 'camera']);
    expect(plan.notes).toEqual([]);
  });

  it('dims the last map and says when the robot was last seen while offline', () => {
    const plan = planStage({
      ...base,
      online: false,
      lastSeenAt: '2026-10-24T14:02:00.000Z',
    });
    expect(plan).toMatchObject({ body: 'map', view: '3d', live3d: true, dimmed: true });
    expect(plan.notes.map((note) => note.text)).toEqual([
      `Not reachable · last seen ${clock('2026-10-24T14:02:00.000Z', 'UTC')}`,
    ]);
  });

  it('says only that it is not reachable when no last seen moment is known', () => {
    expect(planStage({ ...base, online: false }).notes[0]?.text).toBe('Not reachable');
  });

  it('is loading while a map version exists but its scene has not arrived', () => {
    expect(planStage({ ...base, scene: null })).toMatchObject({ body: 'loading', scene: null });
  });

  it('asks for a first mapping inside the selected 3D view when there is no map at all', () => {
    const plan = planStage({ ...base, scene: null, hasMapVersion: false });
    expect(plan).toMatchObject({
      body: 'empty',
      view: '3d',
      views: ['3d', 'camera'],
      live3d: false,
    });
  });

  it('keeps the last good map with its age and a retry when the newer map cannot be read', () => {
    const plan = planStage({ ...base, unreadable: true });
    expect(plan.body).toBe('map');
    const note = plan.notes[0];
    expect(note?.text).toBe(
      `Map from ${clock(scene.fetchedAt, 'UTC')}. The newer map couldn't be read.`,
    );
    expect(note).toMatchObject({ id: 'unreadable', tone: 'warning', action: 'retry' });
  });

  it('shows an unreadable card when no map was ever read', () => {
    expect(
      planStage({ ...base, scene: null, unreadable: true, hasMapVersion: false }),
    ).toMatchObject({
      body: 'unreadable',
      scene: null,
    });
  });

  it('puts the fault, what to do and the rejected command above the map notes', () => {
    const plan = planStage({
      ...base,
      fault: { title: 'The robot vacuum is stuck', hint: 'Move it to a new spot', canHelp: true },
      notAccepted: 'start the room clean',
      unreadable: true,
    });
    expect(plan.notes.map((note) => note.id)).toEqual(['fault', 'not_accepted', 'unreadable']);
    expect(plan.notes[0]).toMatchObject({
      tone: 'critical',
      text: 'The robot vacuum is stuck',
      detail: 'Move it to a new spot',
      action: null,
    });
    expect(plan.notes[1]?.text).toBe(
      "The robot didn't start the room clean. It may have been busy; try again.",
    );
  });

  it('offers no what-to-do action when the fault has no help', () => {
    const plan = planStage({ ...base, fault: { title: 'Fault', hint: null, canHelp: false } });
    expect(plan.notes[0]?.action).toBeNull();
  });
});

describe('camera option', () => {
  it('is always offered, without asking the device for a camera stream capability', () => {
    expect(planStage(base).views).toEqual(['3d', 'camera']);
  });

  it('shows the camera without map notes', () => {
    const plan = planStage({ ...base, requested: 'camera', online: false });
    expect(plan).toMatchObject({ view: 'camera', live3d: false });
    expect(plan.notes).toEqual([]);
  });

  it('can be chosen before any map exists', () => {
    const plan = planStage({ ...base, scene: null, hasMapVersion: false, requested: 'camera' });
    expect(plan).toMatchObject({ view: 'camera', views: ['3d', 'camera'], body: 'empty' });
  });
});

describe('stageStatus', () => {
  it('words the robot state for the map summary', () => {
    expect(stageStatus('Charging', true)).toBe('charging');
    expect(stageStatus('Charging', false)).toBe('not reachable');
    expect(stageStatus(null, true)).toBeNull();
  });
});

describe('describeVacuumMap', () => {
  it('describes the robot map with the robot room by its robot id', () => {
    expect(describeVacuumMap({ ...scene, name: 'Home' }, 3, 'docked')).toBe(
      'Map of Home, 5 rooms, robot in Fixture room 3, docked',
    );
    expect(describeVacuumMap({ ...scene, name: null }, null, null)).toMatch(
      /^Map of Home, 5 rooms/u,
    );
  });
});
