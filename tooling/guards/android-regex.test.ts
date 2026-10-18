import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files';

const nativeSources = filesUnder(join(repositoryRoot, 'apps', 'app', 'modules')).filter(
  (file) => /\.(kt|java)$/.test(file) && !file.includes('/build/'),
);
const unsupported = /UNICODE_CHARACTER_CLASS|\(\?[a-zA-Z]*U[a-zA-Z]*[:)]/;

describe('android regular expressions', () => {
  it('finds the native sources', () => {
    expect(nativeSources.length).toBeGreaterThan(0);
  });

  it('never uses the Unicode character class flag, which Android ICU rejects at startup', () => {
    const offenders = nativeSources.filter((file) => unsupported.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
