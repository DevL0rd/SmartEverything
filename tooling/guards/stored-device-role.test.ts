import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files';

const hubSource = join(repositoryRoot, 'apps', 'hub', 'src');

const CEILING_READERS = new Set(['server/person-access.ts']);

const STORED_ROLE_READ = /clients\s*\.\s*(?:byId|find|owner)\([^)]*\)\s*\??\s*\.role\b/;

const sources = filesUnder(hubSource).filter((file) => file.endsWith('.ts'));

describe('the role of a device', () => {
  it('finds the hub sources', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('is read through the effective role, never straight from the stored device row', () => {
    const offenders = sources
      .filter((file) => !CEILING_READERS.has(relative(hubSource, file)))
      .filter((file) => STORED_ROLE_READ.test(readFileSync(file, 'utf8')))
      .map((file) => relative(repositoryRoot, file));
    expect(offenders).toEqual([]);
  });
});
