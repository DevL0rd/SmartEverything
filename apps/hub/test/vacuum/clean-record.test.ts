import { beforeEach, describe, expect, it } from 'vitest';
import { cleanStartOccurrence } from '../../src/vacuum/events';
import { captureLogs, type CapturedLogs } from '../support/logs';
import {
  AREA,
  BASE,
  BATTERY,
  Bench,
  JOB,
  MODE,
  RECORD,
  ROBOT_EXTERNAL,
  SCOPE,
  SECONDS,
  STATUS,
} from './clean-bench';

const COMMAND_SECOND = BASE / 1000;
const STATION_SECONDS = 190;

function recordOf(label: string, stime = COMMAND_SECOND): string {
  return JSON.stringify({ label, stime, obj: 'record-object' });
}

function liveRun(): Bench {
  const bench = new Bench();
  bench.map.rooms = new Map([[6, 'Room1']]);
  bench.seed(STATUS, 'Charged');
  bench.seed(BATTERY, 100);
  bench.seed(SCOPE, 'Area');
  bench.seed(MODE, 'Sweep Mop');
  bench.seed(JOB, '{"rooms":[6],"clean_mode":3}');
  bench.seed(AREA, 0);
  bench.seed(SECONDS, 0);
  bench.set(STATUS, 'MultiTaskStationWorking');
  bench.advance(STATION_SECONDS);
  bench.set(STATUS, 'Sweeping');
  bench.advance(100);
  bench.set(SECONDS, 182);
  bench.set(STATUS, 'Go Charging');
  bench.advance(60);
  bench.set(STATUS, 'Charging');
  bench.advance(3);
  return bench;
}

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

describe('a clean of the robot as the live run reported it', () => {
  it('opens no clean during the station phase and writes a started event when it moves', () => {
    const bench = liveRun();
    const started = bench.events.filter((event) => event.details['name'] === 'clean_started');
    expect(started).toHaveLength(1);
    const row = bench.rows()[0];
    expect(started[0]).toMatchObject({
      kind: 'activity',
      occurredAt: new Date(BASE + STATION_SECONDS * 1000).toISOString(),
      occurrence: cleanStartOccurrence(ROBOT_EXTERNAL, row?.id ?? ''),
      details: { family: 'vacuum', scope: 'rooms', mode: 'sweep_mop', rooms: [{ id: 6 }] },
    });
    expect(row).toMatchObject({ scope: 'rooms', mode: 'sweep_mop', outcome: null });
    expect(bench.finished()).toHaveLength(0);
  });

  it('records the area, scope and outcome of the robot record and reports the finish once', () => {
    const bench = liveRun();
    bench.set(RECORD, recordOf('00003_0000_3_1792875472_1'));
    expect(bench.rows()).toHaveLength(1);
    expect(bench.rows()[0]).toMatchObject({
      seconds: 182,
      areaM2: 0,
      scope: 'rooms',
      mode: 'sweep_mop',
      outcome: 'stopped',
    });
    expect(bench.finished()).toHaveLength(1);
    expect(bench.finished()[0]?.details).toMatchObject({ outcome: 'stopped', areaM2: 0 });
    expect(bench.sweepComplete()).toBe(true);
    expect(bench.finished()).toHaveLength(1);
    expect(logs.events()).toContain('vacuum_clean.report_after_finish');
  });

  it('reads the record area in thousandths of a square metre and a completed finish', () => {
    const bench = liveRun();
    bench.set(RECORD, recordOf('00004_0480_2_1792875472_0'));
    expect(bench.rows()[0]).toMatchObject({ areaM2: 0.48, scope: 'zone', outcome: 'finished' });
    expect(bench.finished()[0]?.details).toMatchObject({ outcome: 'finished', areaM2: 0.48 });
  });

  it('keeps waiting for the sweep report when the record has no finish code', () => {
    const bench = liveRun();
    bench.set(RECORD, recordOf('00003_0370_3'));
    expect(bench.rows()[0]).toMatchObject({ areaM2: 0.37, outcome: null });
    expect(bench.finished()).toHaveLength(0);
    bench.sweepComplete();
    expect(bench.finished()[0]?.details).toMatchObject({ outcome: 'finished', areaM2: 0.37 });
  });

  it('ignores a record of a later clean and an empty record', () => {
    const bench = liveRun();
    bench.set(RECORD, recordOf('00003_0480_3_1_0', COMMAND_SECOND + 3600));
    bench.set(RECORD, '');
    expect(bench.rows()[0]).toMatchObject({ areaM2: 0, outcome: null });
    expect(bench.finished()).toHaveLength(0);
    expect(logs.events()).toContain('vacuum_clean.record_unmatched');
  });

  it('fails loudly on a record it cannot read and keeps the clean', () => {
    const bench = liveRun();
    bench.set(RECORD, recordOf('00003_0480_3_1_9'));
    bench.set(RECORD, 'not json');
    expect(logs.events().filter((event) => event === 'vacuum_clean.change_failed')).toHaveLength(2);
    expect(bench.rows()[0]).toMatchObject({ outcome: null });
  });
});
