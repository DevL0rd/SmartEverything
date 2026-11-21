import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prepareGlb } from '../../src/models/glb-lod';
import { GlbWorker } from '../../src/models/glb-worker';
import { bundledCodecWorker } from '../support/codec-worker';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { temporaryDirectory } from '../support/server';
import { gridGlb } from './glb-lod-fixtures';

let directory: { path: string; remove: () => Promise<void> };
let worker: GlbWorker;
let logs: CapturedLogs;

beforeEach(async () => {
  logs = captureLogs();
  directory = await temporaryDirectory();
  worker = new GlbWorker(await bundledCodecWorker(directory.path), testLogger('models'));
});

afterEach(async () => {
  await worker.close();
  await directory.remove();
});

describe('the GLB worker', () => {
  it('checks and decimates a GLB off the main thread with the same result as in place', async () => {
    const input = gridGlb({ side: 60 });
    const prepared = await worker.prepare(input);
    const local = await prepareGlb(input);

    expect(prepared.ok).toBe(true);
    expect(local.ok).toBe(true);
    if (!prepared.ok || !local.ok) return;
    expect(prepared.triangles).toBe(local.triangles);
    expect(
      prepared.levels.map((level) => [level.level, level.sha256, level.triangles]),
    ).toStrictEqual(local.levels.map((level) => [level.level, level.sha256, level.triangles]));
    expect(Buffer.from(prepared.levels[0].bytes).equals(Buffer.from(local.levels[0].bytes))).toBe(
      true,
    );
  });

  it('relays the decimation log of the worker to the Hub log', async () => {
    await worker.prepare(gridGlb({ side: 40 }));

    expect(logs.events()).toContain('model_lod.decimate.succeeded');
    expect(
      logs.records.find((record) => record.event === 'model_lod.decimate.succeeded')?.scope,
    ).toBe('hub.models');
  });

  it('says a file that fails the upload check is refused at the check', async () => {
    const prepared = await worker.prepare(new Uint8Array(40));

    expect(prepared.ok).toBe(false);
    expect(!prepared.ok && prepared.stage).toBe('check');
  });

  it('says a file whose levels cannot be made is refused at the level step', async () => {
    const prepared = await worker.prepare(gridGlb({ side: 40, badIndex: true }));

    expect(prepared).toStrictEqual(await prepareGlb(gridGlb({ side: 40, badIndex: true })));
    expect(!prepared.ok && prepared.stage).toBe('lod');
  });
});
