import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import {
  AUTOMATION_V4,
  FLOW_SCOPE_OUTPUTS,
  NODE_REGISTRY,
  type AutomationV3,
} from '@smarteverything/domain';
import { lint, type LintContext } from '@smarteverything/flow/check/lint';
import { describe, expect, it } from 'vitest';
import { structureAutomation } from '../../data/graph-adapter';
import { vacuumScheduleAutomation, type VacuumSchedulePlan } from '../templates/vacuum-schedule';
import type { ConsumerRow } from './row';
import { nextVacuumRun, vacuumSchedulesOf, type VacuumScheduleEntry } from './vacuum-schedule';

const ROBOT = 'robot-1';
const ZONE = 'Europe/Berlin';

const CONTEXT: LintContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
  references: () => true,
  functions: () => undefined,
  secrets: new Set(),
  automations: () => undefined,
};

const ROOMS_PLAN: VacuumSchedulePlan = {
  deviceId: ROBOT,
  name: 'Clean Kitchen and Hall',
  at: '09:30',
  days: [1, 3, 5],
  rooms: [3, 5],
  mode: 'sweep_mop',
};

const HOME_PLAN: VacuumSchedulePlan = {
  ...ROOMS_PLAN,
  name: 'Clean the whole home',
  at: '07:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  rooms: [],
  mode: null,
};

function treeOf(plan: VacuumSchedulePlan): AutomationV3 {
  const found = structureAutomation(vacuumScheduleAutomation(plan).definition, STATIC_KIND_LOOKUP);
  if (found.kind === 'unstructured') throw new Error('the schedule did not turn into steps');
  return found.value.tree;
}

function rowOf(id: string, plan: VacuumSchedulePlan, enabled = true): ConsumerRow {
  return { id, name: plan.name, enabled, definition: treeOf(plan) };
}

function onlyEntry(entries: readonly VacuumScheduleEntry[]): VacuumScheduleEntry {
  const [entry] = entries;
  if (entry === undefined || entries.length !== 1) throw new Error('expected one schedule');
  return entry;
}

describe('vacuum schedule template', () => {
  it('builds a flat v4 automation that checks with zero problems', () => {
    for (const plan of [ROOMS_PLAN, HOME_PLAN]) {
      const { definition, name } = vacuumScheduleAutomation(plan);
      expect(AUTOMATION_V4.safeParse(definition).success).toBe(true);
      expect(definition.version).toBe(4);
      expect(name).toBe(plan.name);
      expect(lint(treeOf(plan), CONTEXT)).toEqual([]);
    }
  });

  it('starts a whole-home clean when no room is chosen', () => {
    const [clean] = treeOf(HOME_PLAN).body.nodes;
    expect(clean?.kind).toBe('device.set');
    expect(clean?.ports).toMatchObject({
      target: { lit: { device: ROBOT } },
      control: { lit: 'cleaning' },
      to: { lit: 'start' },
    });
  });

  it('cleans the chosen rooms in the chosen mode', () => {
    const [clean] = treeOf(ROOMS_PLAN).body.nodes;
    expect(clean?.ports).toMatchObject({
      control: { lit: 'raw:clean_rooms' },
      to: { lit: { rooms: [3, 5], mode: 'sweep_mop' } },
    });
  });
});

describe('vacuum schedules list', () => {
  it('reads back the time, days, rooms and mode of a schedule made from the template', () => {
    const entry = onlyEntry(vacuumSchedulesOf([rowOf('a', ROOMS_PLAN)], ROBOT));
    expect(entry).toStrictEqual({
      automationId: 'a',
      name: ROOMS_PLAN.name,
      enabled: true,
      times: [{ at: '09:30', days: [1, 3, 5] }],
      cleans: [{ kind: 'rooms', rooms: [3, 5], mode: 'sweep_mop' }],
    });
  });

  it('lists only automations that clean this robot, earliest time first', () => {
    const other = rowOf('b', { ...ROOMS_PLAN, deviceId: 'robot-2' });
    const entries = vacuumSchedulesOf(
      [rowOf('a', ROOMS_PLAN), other, rowOf('c', HOME_PLAN, false)],
      ROBOT,
    );
    expect(entries.map((entry) => [entry.automationId, entry.enabled])).toEqual([
      ['c', false],
      ['a', true],
    ]);
  });

  it('lists nothing for a robot that no automation cleans', () => {
    expect(vacuumSchedulesOf([rowOf('a', ROOMS_PLAN)], 'robot-9')).toEqual([]);
  });
});

describe('next vacuum run', () => {
  const entry = onlyEntry(vacuumSchedulesOf([rowOf('a', ROOMS_PLAN)], ROBOT));

  it('is the next chosen weekday at the chosen time at home', () => {
    const saturday = new Date('2026-10-24T12:00:00Z');
    expect(nextVacuumRun(entry, saturday, ZONE)?.toISOString()).toBe('2026-10-26T08:30:00.000Z');
  });

  it('is absent while the schedule is off', () => {
    expect(nextVacuumRun({ ...entry, enabled: false }, new Date(), ZONE)).toBeNull();
  });
});
