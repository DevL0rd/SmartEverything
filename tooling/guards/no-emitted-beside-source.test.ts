import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder, repositoryRoot } from './repository-files';

const projects = ['apps', 'packages'].flatMap((group) =>
  readdirSync(join(repositoryRoot, group)).map((name) => join(repositoryRoot, group, name)),
);
const sourceFolders = projects
  .flatMap((project) => ['src', 'test'].map((folder) => join(project, folder)))
  .filter((folder) => existsSync(folder));
const files = sourceFolders.flatMap((folder) => filesUnder(folder));
const emitted = /\.(js|js\.map|d\.ts|d\.ts\.map)$/;

function twinOf(file: string): string {
  return file.replace(emitted, '.ts');
}

describe('compiled output', () => {
  it('finds the source folders', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never sits beside its source, which only a tsc call on single files without noEmit leaves', () => {
    const offenders = files.filter((file) => emitted.test(file) && existsSync(twinOf(file)));
    expect(offenders).toEqual([]);
  });
});
