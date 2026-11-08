import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository-files';

const THREE = join(repositoryRoot, 'apps', 'app', 'src', 'components', 'models', 'three');

const FINGERPRINTED = [
  'build-model.ts',
  'geometry.ts',
  'materials.ts',
  'patterns.ts',
  'stage.ts',
  'contact-shadow.ts',
  'framing.ts',
] as const;

const RECORDED = {
  version: 4,
  fingerprint: 'c9ec8ca1d9dcb953c49b080036f50094bb4e471415756674d07472de03f02750',
} as const;

function normalised(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function fingerprintOf(sources: ReadonlyMap<string, string>): string {
  const hash = createHash('sha256');
  for (const name of [...sources.keys()].sort()) {
    hash.update(`${name}\n${normalised(sources.get(name) ?? '')}\n`);
  }
  return hash.digest('hex');
}

function readSources(): ReadonlyMap<string, string> {
  return new Map(FINGERPRINTED.map((name) => [name, readFileSync(join(THREE, name), 'utf8')]));
}

function currentVersion(): number {
  const text = readFileSync(join(THREE, 'bake-version.ts'), 'utf8');
  const match = /export const BAKE_VERSION = (\d+);/.exec(text);
  return Number(match?.[1]);
}

describe('bake version', () => {
  it('reads a positive integer version', () => {
    expect(Number.isInteger(currentVersion())).toBe(true);
    expect(currentVersion()).toBeGreaterThan(0);
  });

  it('fingerprints every builder, stage, material, pattern and colour file that exists', () => {
    expect(readSources().size).toBe(FINGERPRINTED.length);
    for (const source of readSources().values()) expect(source.length).toBeGreaterThan(0);
  });

  it('keeps the recorded fingerprint in step with the files and BAKE_VERSION', () => {
    const fingerprint = fingerprintOf(readSources());
    const version = currentVersion();
    const message = `bake inputs changed: bump BAKE_VERSION if the look of a bake changed and record { version: ${String(version)}, fingerprint: '${fingerprint}' } in bake-version.test.ts`;
    expect({ version, fingerprint }, message).toEqual(RECORDED);
  });

  describe('fingerprint', () => {
    const base = new Map([
      ['a.ts', 'one'],
      ['b.ts', 'two'],
    ]);

    it('changes when any file changes', () => {
      const changed = new Map(base).set('b.ts', 'two!');
      expect(fingerprintOf(changed)).not.toBe(fingerprintOf(base));
    });

    it('changes when a file is swapped for another name', () => {
      const renamed = new Map([
        ['a.ts', 'two'],
        ['b.ts', 'one'],
      ]);
      expect(fingerprintOf(renamed)).not.toBe(fingerprintOf(base));
    });

    it('ignores line ending style and map order', () => {
      const windows = new Map([
        ['b.ts', 'two'],
        ['a.ts', 'one'],
      ]);
      expect(fingerprintOf(windows)).toBe(fingerprintOf(base));
      const crlf = new Map([['a.ts', 'x\r\ny']]);
      const lf = new Map([['a.ts', 'x\ny']]);
      expect(fingerprintOf(crlf)).toBe(fingerprintOf(lf));
    });
  });
});
