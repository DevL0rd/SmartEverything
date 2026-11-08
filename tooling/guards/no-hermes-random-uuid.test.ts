import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applicationRoutes,
  applicationSource,
  filesUnder,
  repositoryRoot,
} from './repository-files';

const PHONE_RUN_ROOTS = [
  applicationSource,
  applicationRoutes,
  join(repositoryRoot, 'packages', 'flow', 'src'),
  join(repositoryRoot, 'packages', 'domain', 'src'),
];

const GLOBAL_RANDOM_UUID = /(?<![A-Za-z])crypto\.randomUUID\b/u;

const sources = PHONE_RUN_ROOTS.flatMap((root) => filesUnder(root))
  .filter((file) => /\.tsx?$/u.test(file) && !/\.test\.tsx?$/u.test(file))
  .map((file) => ({ path: relative(repositoryRoot, file), text: readFileSync(file, 'utf8') }));

describe('ids on the phone', () => {
  it('never calls the global crypto.randomUUID, which Hermes does not have', () => {
    expect(
      sources.filter((source) => GLOBAL_RANDOM_UUID.test(source.text)).map((source) => source.path),
    ).toEqual([]);
  });
});
