import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FacePool, FaceWorkerError } from '../../src/vision/faces/pool';
import { visionAssetDirectory } from '../../src/vision/models';
import { testLogger } from '../support/logs';
import { readFile } from 'node:fs/promises';
import type { RgbImage } from '../../src/vision/faces/image';
import type { FaceImage } from '../../src/vision/faces/protocol';
import { blankImage, fixtureImage, fixturePath } from './fixtures';

function rgb(image: RgbImage): FaceImage {
  return { kind: 'rgb', ...image };
}

const BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; const require = createServiceRequire(import.meta.url);';

let bundleFolder = '';
let script = '';
const pools: FacePool[] = [];

function poolOf(directory: string, scriptPath = script): FacePool {
  const pool = new FacePool({
    script: scriptPath,
    directory,
    threads: 1,
    log: testLogger('faces'),
  });
  pools.push(pool);
  return pool;
}

beforeAll(async () => {
  const hub = fileURLToPath(new URL('../../', import.meta.url));
  mkdirSync(join(hub, 'node_modules', '.cache'), { recursive: true });
  bundleFolder = mkdtempSync(join(hub, 'node_modules', '.cache', 'faces-worker-'));
  script = join(bundleFolder, 'faces-worker.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('../../src/vision/faces/worker.ts', import.meta.url))],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    banner: { js: BANNER },
    external: ['openvino-node', 'sharp'],
    logLevel: 'silent',
  });
}, 60_000);

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.close()));
  rmSync(bundleFolder, { recursive: true, force: true });
});

describe('the face worker pool', () => {
  it('finds faces in a worker thread, in order, for several requests at once', async () => {
    const pool = poolOf(visionAssetDirectory());
    const [portrait, pair, blank] = await Promise.all([
      pool.analyse(rgb(await fixtureImage('obama1'))),
      pool.analyse(rgb(await fixtureImage('pair'))),
      pool.analyse(rgb(await blankImage(640, 480))),
    ]);
    expect(portrait).toHaveLength(1);
    expect(pair).toHaveLength(2);
    expect(blank).toHaveLength(0);
    expect(portrait[0]?.embedding).toHaveLength(128);
  }, 120_000);

  it('decodes an encoded picture inside the worker', async () => {
    const pool = poolOf(visionAssetDirectory());
    const pair = await pool.analyse({
      kind: 'encoded',
      bytes: await readFile(fixturePath('pair')),
    });
    expect(pair).toHaveLength(2);
  }, 120_000);

  it('refuses a request whose signal is already aborted', async () => {
    const pool = poolOf(visionAssetDirectory());
    await expect(
      pool.analyse(rgb(await blankImage(64, 64)), AbortSignal.abort(new Error('stop'))),
    ).rejects.toThrow('stop');
  });

  it('rejects an abort that arrives while a request waits', async () => {
    const pool = poolOf(visionAssetDirectory());
    const controller = new AbortController();
    const waiting = pool.analyse(rgb(await fixtureImage('pair')), controller.signal);
    controller.abort(new Error('cancelled'));
    await expect(waiting).rejects.toThrow('cancelled');
  }, 120_000);

  it('reports models that are missing instead of hanging', async () => {
    const empty = mkdtempSync(join(bundleFolder, 'empty-'));
    const pool = poolOf(empty);
    await expect(pool.analyse(rgb(await blankImage(64, 64)))).rejects.toThrow(FaceWorkerError);
  }, 60_000);

  it('reports a worker that cannot start', async () => {
    const broken = join(bundleFolder, 'broken.mjs');
    writeFileSync(broken, 'throw new Error("no start");');
    const pool = poolOf(visionAssetDirectory(), broken);
    await expect(pool.analyse(rgb(await blankImage(64, 64)))).rejects.toThrow('no start');
  });

  it('fails waiting requests when it is closed', async () => {
    const pool = poolOf(visionAssetDirectory());
    const waiting = pool.analyse(rgb(await fixtureImage('pair')));
    await pool.close();
    await expect(waiting).rejects.toThrow(FaceWorkerError);
  }, 120_000);
});
