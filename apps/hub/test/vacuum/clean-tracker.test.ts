import { beforeEach, describe, expect, it } from 'vitest';
import { cleanOccurrence } from '../../src/vacuum/events';
import { captureLogs } from '../support/logs';
import {
  AREA,
  BASE,
  BATTERY,
  JOB,
  LIGHT,
  LIGHT_ID,
  ROBOT_EXTERNAL,
  ROBOT_ID,
  SECONDS,
  STATUS,
  claimable,
  resting,
  sceneOf,
  type Bench,
} from './clean-bench';

const LAST_RETURN = 1_397_163;
const EIGHTH_START = 1_391_168;
const END = Number.MAX_SAFE_INTEGER;

function at(offset: number): string {
  return new Date(BASE + offset).toISOString();
}

function withTask(taskId: number, until: number): Bench {
  const bench = resting();
  bench.playUntil(until);
  bench.map.taskId = taskId;
  bench.tracker.scenePublished(ROBOT_ID, sceneOf(11));
  return bench;
}

describe('vacuum clean tracker on the live status timeline', () => {
  beforeEach(() => {
    captureLogs();
  });

  it('records seven finished cleans and the eighth still running', () => {
    const bench = resting();
    bench.playUntil(END);
    const rows = bench.rows();
    expect(rows).toHaveLength(8);
    expect(rows.map((clean) => clean.outcome)).toStrictEqual([
      ...Array.from({ length: 7 }, () => 'finished'),
      null,
    ]);
    expect(rows[7]?.endedAt).toBeNull();
    expect(bench.finished()).toHaveLength(7);
    expect(bench.events.every((event) => event.details['miotEvent'] === undefined)).toBe(true);
    expect(new Set(bench.finished().map((event) => event.occurrence)).size).toBe(7);
  });

  it('keeps one clean across a pause and does not count the remote drive', () => {
    const bench = resting();
    bench.playUntil(795_632);
    const rows = bench.rows();
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({
      startedAt: at(730_592),
      endedAt: at(777_623),
      outcome: 'finished',
    });
  });

  it('reports the finish once when the report arrives before the dock status', () => {
    const bench = resting();
    bench.playUntil(614_309);
    expect(bench.rows()[0]?.endedAt).toBe(at(614_309));
    bench.playUntil(614_513);
    expect(bench.finished()).toHaveLength(1);
    expect(bench.finished()[0]?.details).toMatchObject({
      family: 'vacuum',
      outcome: 'finished',
      scope: 'rooms',
      mode: 'sweep_mop',
      rooms: [
        { id: 3, name: 'Kitchen' },
        { id: 4, name: 'Room 4' },
      ],
    });
    expect(bench.finished()[0]?.occurrence).toBe(
      cleanOccurrence(ROBOT_EXTERNAL, bench.rows()[0]?.id ?? ''),
    );
  });

  it('waits for the report when the robot docks after returning, then finishes', () => {
    const bench = resting();
    bench.playUntil(721_589);
    expect(bench.finished()).toHaveLength(1);
    expect(bench.rows()[1]?.outcome).toBeNull();
    bench.playUntil(721_631);
    expect(bench.finished()).toHaveLength(2);
    expect(bench.rows()[1]?.outcome).toBe('finished');
  });

  it('stores the results that arrive after the end and ignores the reset to zero', () => {
    const bench = resting();
    bench.playUntil(668_548);
    bench.set(BATTERY, 80);
    bench.playUntil(721_589);
    bench.set(SECONDS, 2103);
    bench.set(AREA, 2022);
    expect(bench.rows()[1]).toMatchObject({ seconds: 2103, areaM2: 20.22, batteryStart: 80 });
    bench.set(AREA, 0);
    bench.set(SECONDS, 0);
    expect(bench.rows()[1]).toMatchObject({ seconds: 2103, areaM2: 20.22 });
  });
});

describe('vacuum clean across a hub restart', () => {
  beforeEach(() => {
    captureLogs();
  });

  it('reopens the running clean from the stored job and does not split it', () => {
    const bench = resting();
    bench.playUntil(EIGHTH_START);
    bench.set(JOB, '{"rooms":[3],"clean_mode":3}');
    expect(bench.rows()).toHaveLength(8);
    bench.tracker.scenePublished(ROBOT_ID, sceneOf(10));
    bench.playUntil(LAST_RETURN);
    const running = bench.rows()[7];
    expect(running?.endedAt).toBeNull();
    bench.restart();
    bench.tracker.resume(ROBOT_ID);
    bench.now = BASE + LAST_RETURN + 60_000;
    bench.set(STATUS, 2);
    bench.sweepComplete();
    expect(bench.rows()).toHaveLength(8);
    expect(bench.rows()[7]).toMatchObject({
      id: running?.id,
      startedAt: running?.startedAt,
      outcome: 'finished',
    });
    expect(bench.finished()).toHaveLength(8);
  });

  it('stores a clean at its start, so a restart with no map published keeps the real start', () => {
    const bench = resting();
    bench.playUntil(EIGHTH_START);
    bench.set(JOB, '{"rooms":[3],"clean_mode":3}');
    const started = bench.rows().at(-1);
    expect(started).toMatchObject({ startedAt: at(EIGHTH_START), endedAt: null });
    bench.restart();
    bench.now = BASE + LAST_RETURN;
    bench.tracker.resume(ROBOT_ID);
    bench.set(STATUS, 6);
    bench.set(STATUS, 2);
    bench.sweepComplete();
    expect(bench.rows()).toHaveLength(8);
    expect(bench.rows()[7]).toMatchObject({
      id: started?.id,
      startedAt: at(EIGHTH_START),
      outcome: 'finished',
    });
  });

  it('reopens a push that arrives first after the restart, whatever role it is', () => {
    const bench = resting();
    bench.playUntil(EIGHTH_START);
    bench.set(JOB, '{"rooms":[3],"clean_mode":3}');
    bench.tracker.scenePublished(ROBOT_ID, sceneOf(10));
    bench.restart();
    bench.set(BATTERY, 70);
    expect(bench.rows()).toHaveLength(8);
    bench.now = BASE + LAST_RETURN;
    bench.set(STATUS, 6);
    bench.set(STATUS, 2);
    bench.sweepComplete();
    expect(bench.rows()).toHaveLength(8);
    expect(bench.rows()[7]?.outcome).toBe('finished');
  });

  it('reopens by the map task id and keeps the id the clean was stored under', () => {
    const bench = withTask(7001, EIGHTH_START);
    bench.playUntil(LAST_RETURN);
    expect(bench.rows().at(-1)).toMatchObject({ id: 'task-7001', endedAt: null });
    bench.restart();
    bench.tracker.resume(ROBOT_ID);
    expect(bench.rows()).toHaveLength(8);
    expect(bench.rows().at(-1)).toMatchObject({ id: 'task-7001', endedAt: null });
  });

  it('closes a stored clean of another task and starts a new one', () => {
    const bench = withTask(7001, EIGHTH_START);
    bench.restart();
    bench.map.taskId = 7002;
    bench.tracker.resume(ROBOT_ID);
    const rows = bench.rows();
    expect(rows).toHaveLength(9);
    expect(rows[7]).toMatchObject({ id: 'task-7001', outcome: null });
    expect(rows[7]?.endedAt).not.toBeNull();
    expect(rows[8]).toMatchObject({ id: 'task-7002', endedAt: null });
  });

  it('never overwrites a finished clean with the stale task id of the previous one', () => {
    const bench = resting();
    bench.set(STATUS, 4);
    bench.map.taskId = 7001;
    bench.tracker.scenePublished(ROBOT_ID, sceneOf(11));
    bench.set(STATUS, 6);
    bench.set(STATUS, 2);
    bench.sweepComplete();
    const first = bench.rows()[0];
    bench.advance(3600);
    bench.set(STATUS, 4);
    bench.restart();
    bench.tracker.resume(ROBOT_ID);
    expect(bench.rows()).toHaveLength(2);
    expect(bench.rows()[0]).toStrictEqual(first);
    expect(bench.rows()[1]?.id.startsWith('start-')).toBe(true);
    bench.map.taskId = 7002;
    bench.tracker.scenePublished(ROBOT_ID, sceneOf(12));
    expect(bench.rows().map((clean) => clean.id.slice(0, 5))).toStrictEqual(['task-', 'start']);
  });

  it('ends a stored clean that finished while the hub was down, with the final results', () => {
    const bench = resting();
    bench.playUntil(EIGHTH_START);
    bench.set(JOB, '{"rooms":[3],"clean_mode":3}');
    bench.tracker.scenePublished(ROBOT_ID, sceneOf(10));
    bench.restart();
    bench.set(STATUS, 2);
    bench.set(SECONDS, 1800);
    bench.set(AREA, 1500);
    bench.tracker.resume(ROBOT_ID);
    expect(bench.rows()).toHaveLength(8);
    expect(bench.rows()[7]).toMatchObject({ outcome: null, seconds: 1800, areaM2: 15 });
    expect(bench.rows()[7]?.endedAt).not.toBeNull();
  });

  it('joins a clean it never saw start and reopens it again after a second restart', () => {
    const bench = resting();
    bench.set(STATUS, 4);
    bench.restart();
    bench.tracker.resume(ROBOT_ID);
    expect(bench.rows()).toHaveLength(1);
    const joined = bench.rows()[0];
    bench.restart();
    bench.tracker.resume(ROBOT_ID);
    expect(bench.rows()).toHaveLength(1);
    expect(bench.rows()[0]?.id).toBe(joined?.id);
  });
});

describe('vacuum clean outcomes, trajectory and scope', () => {
  beforeEach(() => {
    captureLogs();
  });

  it('ends in an error when the robot faults mid clean', () => {
    const bench = resting();
    bench.set(STATUS, 4);
    bench.advance(120);
    bench.set(STATUS, 15);
    expect(bench.rows()[0]).toMatchObject({ outcome: 'error', seconds: 120 });
    expect(bench.finished()[0]?.details['outcome']).toBe('error');
  });

  it('ends as returned with a low battery after the recharge statuses', () => {
    const bench = resting();
    bench.set(STATUS, 4);
    bench.set(STATUS, 19);
    bench.set(STATUS, 3);
    expect(bench.rows()).toHaveLength(1);
    expect(bench.rows()[0]?.endedAt).toBeNull();
    bench.set(STATUS, 9);
    expect(bench.rows()[0]?.outcome).toBe('returned_low_battery');
    expect(bench.finished()).toHaveLength(1);
  });

  it('ends a stop from pause as stopped', () => {
    const bench = resting();
    bench.set(STATUS, 4);
    bench.set(STATUS, 5);
    bench.set(STATUS, 2);
    expect(bench.rows()[0]?.outcome).toBe('stopped');
  });

  it('calls a docked return without its report stopped once the next clean starts', () => {
    const bench = resting();
    bench.set(STATUS, 4);
    bench.set(STATUS, 6);
    bench.set(STATUS, 2);
    expect(bench.finished()).toHaveLength(0);
    bench.advance(600);
    bench.set(STATUS, 4);
    expect(bench.finished()).toHaveLength(1);
    expect(bench.rows()).toHaveLength(2);
    expect(bench.rows()[0]?.outcome).toBe('stopped');
    expect(bench.rows()[1]?.endedAt).toBeNull();
  });

  it('keeps the final trajectory and map index, also when the last map arrives after the end', () => {
    const bench = resting();
    bench.set(STATUS, 4);
    const run = [
      {
        mopping: false,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
      },
    ];
    bench.tracker.scenePublished(ROBOT_ID, sceneOf(5, run));
    bench.set(STATUS, 6);
    bench.set(STATUS, 2);
    bench.sweepComplete();
    expect(bench.rows()[0]).toMatchObject({ mapIndex: 5, trail: run });
    const last = [
      {
        mopping: true,
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 1 },
        ],
      },
    ];
    bench.tracker.scenePublished(ROBOT_ID, sceneOf(6, last));
    expect(bench.rows()[0]).toMatchObject({ mapIndex: 6, trail: last });
    bench.tracker.scenePublished(ROBOT_ID, sceneOf(7, run));
    expect(bench.rows()[0]?.mapIndex).toBe(6);
  });

  it('records the zones in metres and picks up the job that arrives after the start', () => {
    const bench = resting();
    bench.seed(JOB, '{}');
    bench.set(STATUS, 4);
    bench.set(JOB, '{"zones":[[-500,300,-500,-300,500,-300,500,300]],"clean_mode":2}');
    bench.set(STATUS, 2);
    expect(bench.rows()[0]?.zones).toStrictEqual([
      [
        { x: -0.5, y: 0.3 },
        { x: -0.5, y: -0.3 },
        { x: 0.5, y: -0.3 },
        { x: 0.5, y: 0.3 },
      ],
    ]);
  });

  it('ignores other devices and reports that are not the robot report', () => {
    const bench = resting();
    bench.set('power', true, LIGHT_ID);
    expect(bench.sweepComplete()).toBe(false);
    expect(bench.rows()).toHaveLength(0);
    const report = bench.events[0];
    expect(report?.kind).toBe('cycle_finished');
    expect(report === undefined ? true : bench.tracker.claim(claimable(LIGHT), report)).toBe(false);
  });
});
