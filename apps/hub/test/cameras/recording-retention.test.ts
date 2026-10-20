import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeviceRow, RecordingKind } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RecordingRetention,
  STARTUP_SWEEP_DELAY_MS,
  nextSweepAt,
} from '../../src/cameras/recording-retention';
import { thumbnailPathOf } from '../../src/cameras/thumbnails';
import { recordingPathIn } from '../../src/services';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { furnishHome } from '../support/tool-home';

const NOW = '2026-10-20T12:00:00.000Z';
const DAY_MS = 86_400_000;

let opened: TestStore;
let logs: CapturedLogs;
let clock: FakeClock;
let current: Date;
let directory: string;
let front: DeviceRow;
let back: DeviceRow;
let retention: RecordingRetention;

const daysAgo = (days: number): Date => new Date(Date.parse(NOW) - days * DAY_MS);

async function remembered(
  device: DeviceRow,
  name: string,
  age: number,
  options: { readonly files: boolean } = { files: true },
): Promise<string> {
  current = daysAgo(age);
  const kind: RecordingKind = 'clip';
  const row = opened.store.cameras.addRecording({
    deviceId: device.id,
    eventId: null,
    kind,
    storagePath: `${device.id}/${name}.mp4`,
    startedAt: current.toISOString(),
    durationMs: 1000,
    bytes: 100,
  });
  current = new Date(NOW);
  if (options.files) {
    const path = recordingPathIn(directory)(row.storage_path);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, 'clip');
    await writeFile(thumbnailPathOf(path), 'thumb');
  }
  return row.id;
}

async function filesOf(device: DeviceRow): Promise<string[]> {
  return (await readdir(join(directory, 'recordings', device.id)).catch(() => [])).sort();
}

const idsOf = (device: DeviceRow): string[] =>
  opened.store.cameras.recordings({ deviceIds: [device.id], limit: 100 }).map((row) => row.id);

beforeEach(async () => {
  logs = captureLogs();
  current = new Date(NOW);
  opened = await testStore(() => current);
  const home = furnishHome(opened.store);
  front = home.camera;
  back = home.other;
  opened.store.cameras.upsert(
    [front, back].map((device) => ({
      deviceId: device.id,
      streamName: device.id,
      sourceUrlKind: 'rtsp',
      physicalPtz: false,
      twoWayAudio: false,
    })),
  );
  directory = await mkdtemp(join(tmpdir(), 'hub-retention-'));
  clock = new FakeClock(NOW);
  retention = new RecordingRetention({
    store: opened.store,
    recordingPath: recordingPathIn(directory),
    clock,
    log: testLogger('cameras'),
  });
});

afterEach(async () => {
  retention.stop();
  await opened.close();
  await rm(directory, { recursive: true, force: true });
});

describe('recording retention sweep', () => {
  it('keeps every camera at 15 days unless told otherwise', () => {
    expect(opened.store.cameras.list().map((camera) => camera.keep_days)).toEqual([15, 15]);
  });

  it('deletes recordings older than the kept days with their files and thumbnails, and keeps newer ones', async () => {
    const stale = await remembered(front, 'stale', 16);
    const fresh = await remembered(front, 'fresh', 14);
    const summary = await retention.sweep();
    expect(summary).toEqual({ recordings: 1, bytes: 100, failed: 0 });
    expect(idsOf(front)).toEqual([fresh]);
    expect(idsOf(front)).not.toContain(stale);
    expect(await filesOf(front)).toEqual(['fresh.mp4', 'fresh.mp4.thumb.jpg']);
  });

  it('respects the days set on each camera', async () => {
    opened.store.cameras.change(back.id, { keep_days: 3 });
    const frontKept = await remembered(front, 'kept', 10);
    await remembered(back, 'dropped', 10);
    const backKept = await remembered(back, 'recent', 2);
    await retention.sweep();
    expect(idsOf(front)).toEqual([frontKept]);
    expect(idsOf(back)).toEqual([backKept]);
    expect(await filesOf(back)).toEqual(['recent.mp4', 'recent.mp4.thumb.jpg']);
  });

  it('tolerates a recording whose files are already gone', async () => {
    await remembered(front, 'gone', 30, { files: false });
    const summary = await retention.sweep();
    expect(summary).toEqual({ recordings: 1, bytes: 100, failed: 0 });
    expect(idsOf(front)).toEqual([]);
    expect(logs.events()).not.toContain('recording.file_not_removed');
  });

  it('warns loudly about a file it cannot delete and still removes the row', async () => {
    await remembered(front, 'stuck', 30);
    const path = recordingPathIn(directory)(`${front.id}/stuck.mp4`);
    await rm(path);
    await mkdir(join(path, 'inside'), { recursive: true });
    const summary = await retention.sweep();
    expect(summary.failed).toBe(1);
    expect(
      logs.records.find((record) => record.event === 'recording.file_not_removed'),
    ).toMatchObject({
      level: 'warn',
      payload: { deviceId: front.id, storagePath: `${front.id}/stuck.mp4` },
    });
  });

  it('logs one summary line per sweep with counts and bytes', async () => {
    await remembered(front, 'one', 20);
    await remembered(back, 'two', 40);
    await retention.sweep();
    const summaries = logs.records.filter((record) => record.event === 'recording.pruned');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      level: 'info',
      payload: { recordings: 2, bytes: 200, failed: 0 },
    });
  });

  it('announces each removed recording on the change feed so open screens drop it', async () => {
    const id = await remembered(front, 'announced', 20);
    const removed: string[] = [];
    opened.store.feed.subscribe((change) => {
      if (change.table === 'recordings' && change.oldRecord !== null && change.record === null) {
        removed.push(change.oldRecord.id);
      }
    });
    await retention.sweep();
    expect(removed).toEqual([id]);
  });
});

describe('recording retention schedule', () => {
  it('arms a sweep shortly after start and the next daily sweep at the quiet hour', () => {
    retention.start();
    const startup = new Date(Date.parse(NOW) + STARTUP_SWEEP_DELAY_MS).toISOString();
    expect(clock.pending()).toEqual([startup, nextSweepAt(new Date(NOW)).toISOString()].sort());
  });

  it('sweeps at the startup moment and again each day, arming the following day each time', async () => {
    await remembered(front, 'old', 20);
    retention.start();
    clock.advanceTo(new Date(Date.parse(NOW) + STARTUP_SWEEP_DELAY_MS).toISOString());
    await retention.sweep();
    expect(logs.events().filter((event) => event === 'recording.pruned')).toHaveLength(2);
    const daily = nextSweepAt(new Date(NOW));
    clock.advanceTo(daily.toISOString());
    await retention.sweep();
    expect(logs.events().filter((event) => event === 'recording.pruned')).toHaveLength(4);
    expect(clock.pending()).toEqual([nextSweepAt(daily).toISOString()]);
  });

  it('sweeps when a camera keep days changes and not for other changes', async () => {
    const id = await remembered(front, 'week', 8);
    retention.start();
    opened.store.cameras.change(front.id, { record_events: false });
    await retention.sweep();
    expect(idsOf(front)).toEqual([id]);
    opened.store.cameras.change(front.id, { keep_days: 7 });
    await retention.sweep();
    expect(idsOf(front)).toEqual([]);
    expect(await filesOf(front)).toEqual([]);
  });

  it('stops arming and listening once stopped', () => {
    retention.start();
    retention.stop();
    expect(clock.pending()).toEqual([]);
  });
});

describe('nextSweepAt', () => {
  it('is the next 04:00 local time, today if it is still ahead', () => {
    const before = new Date(2026, 9, 20, 1, 0, 0);
    const after = new Date(2026, 9, 20, 5, 0, 0);
    expect(nextSweepAt(before)).toEqual(new Date(2026, 9, 20, 4, 0, 0));
    expect(nextSweepAt(after)).toEqual(new Date(2026, 9, 21, 4, 0, 0));
  });
});
