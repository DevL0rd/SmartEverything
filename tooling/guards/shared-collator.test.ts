import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applicationRoutes,
  applicationSource,
  filesUnder,
  repositoryRoot,
} from './repository-files';

function offenders(): string[] {
  return [applicationSource, applicationRoutes]
    .flatMap((root) => filesUnder(root))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))
    .filter((file) => /\.localeCompare\s*\(/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(repositoryRoot, file).replace(/\\/g, '/'));
}

describe('string ordering in the app', () => {
  it('goes through the shared collators, never a locale lookup per comparison', () => {
    expect(offenders()).toEqual([]);
  });
});
