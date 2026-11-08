import { gzipSync } from 'node:zlib';
import type { HomeMapScanFormat } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  PLY_HEADER_LIMIT,
  createScanValidator,
  parsePlyHeader,
  type ScanVerdict,
} from '../../src/home-map/scan-validate';
import { plyFile, spzFile, splatFile } from './scan-fixtures';

interface Outcome {
  readonly early: string | null;
  readonly verdict: ScanVerdict;
}

async function check(format: HomeMapScanFormat, file: Buffer, chunkSize = 1024): Promise<Outcome> {
  const validator = createScanValidator(format);
  let early: string | null = null;
  for (let at = 0; at < file.length && early === null; at += chunkSize) {
    early = await validator.feed(file.subarray(at, at + chunkSize));
  }
  const verdict = await validator.finish();
  validator.cancel();
  return { early, verdict };
}

const problemOf = (outcome: Outcome): string =>
  outcome.early ?? (outcome.verdict.ok ? 'accepted' : outcome.verdict.problem);

describe('ply', () => {
  it('accepts a binary little endian gaussian file and counts the vertices', async () => {
    const outcome = await check('ply', plyFile(500));
    expect(outcome.early).toBeNull();
    expect(outcome.verdict).toEqual({ ok: true, points: 500 });
  });

  it('accepts extra vertex properties and counts them in the stride', async () => {
    const properties = [
      'x',
      'y',
      'z',
      'nx',
      'ny',
      'nz',
      'f_dc_0',
      'f_dc_1',
      'f_dc_2',
      'opacity',
    ].concat(['scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']);
    expect((await check('ply', plyFile(40, { properties }))).verdict).toEqual({
      ok: true,
      points: 40,
    });
  });

  it('accepts a header split over many tiny chunks', async () => {
    expect((await check('ply', plyFile(30), 3)).verdict).toEqual({ ok: true, points: 30 });
  });

  it('refuses a body shorter than the vertex count needs', async () => {
    const outcome = await check('ply', plyFile(100, { bodyBytes: 100 * 56 - 4 }));
    expect(problemOf(outcome)).toContain('need 5600');
  });

  it('refuses a body longer than the vertex count needs', async () => {
    const outcome = await check('ply', plyFile(100, { bodyBytes: 100 * 56 + 1 }));
    expect(problemOf(outcome)).toContain('longer');
  });

  it('refuses wrong magic as soon as the first bytes arrive', async () => {
    const outcome = await check('ply', Buffer.from('PK\u0003\u0004 not a ply file at all'), 2);
    expect(outcome.early).toContain('does not start with the ply header');
  });

  it('refuses an ascii or big endian format', async () => {
    expect(problemOf(await check('ply', plyFile(3, { format: 'ascii 1.0' })))).toContain(
      'binary_little_endian',
    );
    expect(
      problemOf(await check('ply', plyFile(3, { format: 'binary_big_endian 1.0' }))),
    ).toContain('binary_little_endian');
  });

  it('refuses a vertex without the gaussian properties', async () => {
    const outcome = await check('ply', plyFile(3, { properties: ['x', 'y', 'z', 'red'] }));
    expect(problemOf(outcome)).toContain('lacks the gaussian properties');
  });

  it('refuses another element, a list property and a zero vertex count', async () => {
    expect(problemOf(await check('ply', plyFile(2, { extraLines: ['element face 3'] })))).toContain(
      '"face" is not supported',
    );
    expect(parsePlyHeader('ply\nformat binary_little_endian 1.0\nelement vertex 0')).toContain(
      'positive whole number',
    );
    expect(
      parsePlyHeader(
        'ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty list uchar int a',
      ),
    ).toContain('list properties');
  });

  it('refuses a file that ends inside the header and an endless header', async () => {
    expect(
      problemOf(await check('ply', Buffer.from('ply\nformat binary_little_endian 1.0\n'))),
    ).toContain('ends inside the ply header');
    const endless = Buffer.from(`ply\n${'comment x\n'.repeat(PLY_HEADER_LIMIT / 10 + 100)}`);
    expect(problemOf(await check('ply', endless, endless.length))).toContain('does not end within');
  });

  it('refuses an empty file', async () => {
    expect(problemOf(await check('ply', Buffer.alloc(0)))).toContain('ends inside the ply header');
  });
});

describe('splat', () => {
  it('accepts a whole number of 32 byte splats', async () => {
    expect((await check('splat', splatFile(64), 100)).verdict).toEqual({ ok: true, points: 64 });
  });

  it('refuses an empty file and a length that is not a multiple of 32', async () => {
    expect(problemOf(await check('splat', Buffer.alloc(0)))).toContain('empty');
    expect(
      problemOf(await check('splat', Buffer.concat([splatFile(3), Buffer.alloc(5)]))),
    ).toContain('not a whole number');
  });
});

describe('spz', () => {
  it.each([
    [1, 0],
    [2, 0],
    [2, 3],
    [3, 1],
    [3, 2],
  ])('accepts version %i with spherical harmonics degree %i', async (version, degree) => {
    const outcome = await check('spz', spzFile(25, { version, degree }), 64);
    expect(outcome.verdict).toEqual({ ok: true, points: 25 });
  });

  it('refuses a file that is not gzip', async () => {
    const outcome = await check('spz', Buffer.from('this is not gzip data'), 1);
    expect(outcome.early).toContain('gzip magic');
  });

  it('refuses a wrong SPZ magic, an unknown version and a bad degree', async () => {
    expect(problemOf(await check('spz', spzFile(2, { magic: 0x12345678 })))).toContain('magic');
    expect(problemOf(await check('spz', spzFile(2, { version: 9 })))).toContain('version 9');
    expect(problemOf(await check('spz', spzFile(2, { degree: 7 })))).toContain('degree 7');
  });

  it('refuses a body that does not match the point count', async () => {
    expect(problemOf(await check('spz', spzFile(10, { bodyBytes: 10 * 19 - 1 })))).toContain(
      'need',
    );
    expect(problemOf(await check('spz', spzFile(10, { bodyBytes: 10 * 19 + 40 })))).toContain(
      'longer',
    );
  });

  it('refuses a truncated gzip stream', async () => {
    const whole = spzFile(500);
    const outcome = await check('spz', whole.subarray(0, whole.length - 30), 50);
    expect(problemOf(outcome)).toContain('gzip stream is damaged');
  });

  it('refuses a gzip file without an SPZ header', async () => {
    expect(problemOf(await check('spz', gzipSync(Buffer.from('tiny'))))).toContain(
      'inside its header',
    );
  });
});

describe('rad', () => {
  it('is not accepted as an upload', async () => {
    expect((await check('rad', Buffer.from('RAD0....'))).early).toContain('made by the hub');
  });
});
