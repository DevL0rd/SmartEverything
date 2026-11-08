import { describe, expect, it } from 'vitest';
import {
  CONSUMABLE_LOW_PERCENT,
  VacuumConsumableWatch,
  VacuumFaultWatch,
  cleanFactsOf,
  cleanOccurrence,
  alertDismissal,
  cycleFinishedWithFacts,
} from '../../src/vacuum/events';

const AT = '2026-10-24T10:00:00.000Z';
const ROBOT = 'robot';

describe('vacuum fault watch', () => {
  it('raises each code of the live list once and again after it cleared', () => {
    const watch = new VacuumFaultWatch();
    const first = watch.list(ROBOT, '{"ts":100,"fault":[100051,100008]}', AT);
    expect(first.map((event) => [event.kind, event.details['code']])).toStrictEqual([
      ['activity', 100051],
      ['fault', 100008],
    ]);
    expect(first.map((event) => event.occurrence)).toStrictEqual([
      `vacuum:${ROBOT}:fault:100051:100`,
      `vacuum:${ROBOT}:fault:100008:100`,
    ]);
    expect(watch.list(ROBOT, '{"ts":101,"fault":[100051,100008]}', AT)).toStrictEqual([]);
    expect(watch.list(ROBOT, '{"ts":102,"fault":[0]}', AT)).toStrictEqual([]);
    expect(watch.list(ROBOT, '{"ts":103,"fault":[100051]}', AT)).toHaveLength(1);
  });

  it('does not repeat a code already raised from the other property', () => {
    const watch = new VacuumFaultWatch();
    expect(watch.latch(ROBOT, 0, AT)).toStrictEqual([]);
    expect(watch.latch(ROBOT, 100051, AT)).toHaveLength(1);
    expect(watch.list(ROBOT, '{"fault":[100051]}', AT)).toStrictEqual([]);
    const second = new VacuumFaultWatch();
    expect(second.list(ROBOT, '{"fault":[100051]}', AT)).toHaveLength(1);
    expect(second.latch(ROBOT, 100008, AT)).toStrictEqual([]);
    expect(second.latch(ROBOT, 100008, AT)).toStrictEqual([]);
    expect(second.latch(ROBOT, 100006, AT).map((event) => event.details['source'])).toStrictEqual([
      'fault',
    ]);
  });

  it('takes the first latched value as a baseline, not as a new fault', () => {
    const watch = new VacuumFaultWatch();
    expect(watch.latch(ROBOT, 100008, AT)).toStrictEqual([]);
    expect(watch.latch(ROBOT, 100008, AT)).toStrictEqual([]);
  });

  it('rejects values that are not fault data', () => {
    const watch = new VacuumFaultWatch();
    expect(() => watch.list(ROBOT, 'not json', AT)).toThrow('fault list');
    expect(() => watch.list(ROBOT, '{"fault":"x"}', AT)).toThrow('fault list');
    expect(() => watch.latch(ROBOT, 'x', AT)).toThrow('fault code');
  });
});

describe('vacuum consumable watch', () => {
  const reading = (level: number): Parameters<VacuumConsumableWatch['observe']>[0] => ({
    deviceId: ROBOT,
    id: 'filter',
    level,
    occurredAt: AT,
  });

  it('raises maintenance once per fall under the threshold', () => {
    const watch = new VacuumConsumableWatch();
    expect(watch.observe(reading(50))).toBeNull();
    const event = watch.observe(reading(CONSUMABLE_LOW_PERCENT - 1));
    expect(event?.kind).toBe('maintenance');
    expect(event?.details).toMatchObject({
      family: 'vacuum',
      item: 'filter',
      state: 'low',
      level: CONSUMABLE_LOW_PERCENT - 1,
    });
    expect(watch.observe(reading(5))).toBeNull();
    expect(watch.observe(reading(100))).toBeNull();
    expect(watch.observe(reading(4))?.kind).toBe('maintenance');
  });

  it('does not repeat a low level it sees first after a restart', () => {
    expect(new VacuumConsumableWatch().observe(reading(3))).toBeNull();
  });

  it('tracks each consumable of each robot on its own', () => {
    const watch = new VacuumConsumableWatch();
    watch.observe(reading(50));
    expect(watch.observe({ ...reading(5), id: 'mop' })).toBeNull();
    expect(watch.observe({ ...reading(5), deviceId: 'other' })).toBeNull();
    expect(watch.observe(reading(5))?.kind).toBe('maintenance');
  });
});

describe('clean facts on the finished cycle', () => {
  const event = {
    externalId: ROBOT,
    kind: 'cycle_finished',
    occurredAt: AT,
    details: { family: 'vacuum', miotEvent: 'sweep-complete', outcome: 'finished' },
  } as const;

  it('adds scope, mode, rooms, seconds and the clean id from the robot state', () => {
    const facts = cleanFactsOf(
      {
        vacuum_scope: 3,
        vacuum_mode: 3,
        vacuum_seconds: 2103,
        vacuum_area: 2022,
        vacuum_job: '{"rooms":[3,4]}',
      },
      new Map([[3, 'Kitchen']]),
      { id: 'clean-1', areaM2: null },
    );
    const result = cycleFinishedWithFacts(event, facts);
    expect(result.details).toMatchObject({
      outcome: 'finished',
      cleanId: 'clean-1',
      areaM2: null,
      areaRaw: 2022,
      seconds: 2103,
      scope: 'rooms',
      mode: 'sweep_mop',
      rooms: [
        { id: 3, name: 'Kitchen' },
        { id: 4, name: 'Room 4' },
      ],
    });
    expect(result.occurrence).toBe(cleanOccurrence(ROBOT, 'clean-1'));
  });

  it('leaves the event without an occurrence when the clean id is unknown', () => {
    const facts = cleanFactsOf({}, new Map(), { id: null, areaM2: null });
    const result = cycleFinishedWithFacts(event, facts);
    expect(result.occurrence).toBeUndefined();
    expect(result.details).toMatchObject({ seconds: null, scope: null, mode: null, rooms: [] });
  });
});

describe('alert dismissal', () => {
  it('builds the close-card call for an alert event and for nothing else', () => {
    const watch = new VacuumFaultWatch();
    const [alert, error] = watch.list(ROBOT, '{"fault":[100051,100006]}', AT);
    const command = alertDismissal(alert ?? failure());
    expect(command?.action).toMatchObject({ siid: 2, aiid: 48 });
    expect(command?.action?.in).toStrictEqual([{ piid: 24, value: '{"fault":[100051]}' }]);
    expect(error?.kind).toBe('fault');
    expect(alertDismissal(error ?? failure())).toBeNull();
  });
});

function failure(): never {
  throw new Error('the fault list produced no event');
}
