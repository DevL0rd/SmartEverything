import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const ENGLISH = z
  .strictObject({ code: z.literal('eng'), gzip: z.boolean(), langPath: z.string().min(1) })
  .parse(createRequire(repositoryFile('apps/hub/package.json'))('@tesseract.js-data/eng'));

describe('@tesseract.js-data/eng contract', () => {
  it('is declared at the installed version by the hub', () => {
    expect(declaredVersion(HUB_MANIFEST, '@tesseract.js-data/eng')).toBe(
      installedVersion('@tesseract.js-data/eng'),
    );
  });

  it('names the English code, a language folder and the gzip flag tesseract.js reads', () => {
    expect(ENGLISH.code).toBe('eng');
    expect(ENGLISH.gzip).toBe(true);
    expect(readdirSync(ENGLISH.langPath)).toStrictEqual(['eng.traineddata.gz']);
  });

  it('holds a gzip file that unpacks to a Tesseract training data archive', () => {
    const packed = readFileSync(join(ENGLISH.langPath, 'eng.traineddata.gz'));
    expect([...packed.subarray(0, 2)]).toStrictEqual([0x1f, 0x8b]);
    const unpacked = gunzipSync(packed);
    expect(unpacked.length).toBeGreaterThan(packed.length);
    expect(unpacked.readUInt32LE(0)).toBeGreaterThan(0);
  });
});
