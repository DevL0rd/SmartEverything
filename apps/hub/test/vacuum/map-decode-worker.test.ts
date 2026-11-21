import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { MapBlobError, NO_PUSHED_MAP_OBJECTS, pv11glCatalog } from '@smarteverything/xiaomi';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decodeVacuumMap, errorOf, type MapDecodeJob } from '../../src/vacuum/map-decode';
import { MapDecodeWorker } from '../../src/vacuum/map-decode-worker';
import { readVacuumFixture } from '../support/fake-vacuum';
import { sealVacuumMap } from '../support/fake-vacuum-cloud';

const DID = '5550001';

let folder: string;
let script: string;

beforeAll(async () => {
  folder = await mkdtemp(join(fileURLToPath(new URL('../../', import.meta.url)), '.map-worker-'));
  script = join(folder, 'vacuum-map-worker.mjs');
  await build({
    entryPoints: [fileURLToPath(new URL('../../src/vacuum/map-worker.ts', import.meta.url))],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
}, 60_000);

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

function jobOf(bytes: Uint8Array): MapDecodeJob {
  return {
    bytes,
    model: pv11glCatalog().model,
    did: DID,
    slot: 'current',
    index: 7,
    fetchedAt: '2026-10-24T10:00:00.000Z',
    pushed: NO_PUSHED_MAP_OBJECTS,
  };
}

function sealedCurrent(): Uint8Array {
  const document = readVacuumFixture('maps/pv11gl-current.json', z.unknown());
  return sealVacuumMap(document, pv11glCatalog().model, DID);
}

describe('the vacuum map worker', () => {
  it('builds the same scene, task and route as the decode it runs', async () => {
    const decoder = new MapDecodeWorker(script);
    try {
      const outcome = await decoder.decode(jobOf(sealedCurrent()));
      expect(outcome.stage).toBe('done');
      expect(outcome).toStrictEqual(decodeVacuumMap(jobOf(sealedCurrent())));
    } finally {
      await decoder.close();
    }
  });

  it('answers concurrent maps each with their own outcome', async () => {
    const decoder = new MapDecodeWorker(script);
    try {
      const [good, broken] = await Promise.all([
        decoder.decode(jobOf(sealedCurrent())),
        decoder.decode(jobOf(Buffer.from('{"version":2,"data":"AAAA"}'))),
      ]);
      expect(good.stage).toBe('done');
      expect(broken.stage).toBe('decode');
      if (broken.stage !== 'decode') throw new Error('the broken map decoded');
      expect(errorOf(broken.error)).toBeInstanceOf(MapBlobError);
    } finally {
      await decoder.close();
    }
  });

  it('fails a waiting map loudly when it is stopped', async () => {
    const decoder = new MapDecodeWorker(script);
    const failed = expect(decoder.decode(jobOf(sealedCurrent()))).rejects.toThrow(
      'The vacuum map worker was stopped.',
    );
    await decoder.close();
    await failed;
  });
});
