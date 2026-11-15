import { globSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { repositoryRoot } from './repository-files';

const SKIPPED_FOLDERS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'out',
  'tmp',
  'optimization',
  '.expo',
  '.stryker-tmp',
  '.cache',
  'reports',
  'android',
  'ios',
]);

const TEST_FILE = /\.test\.tsx?$/;

const projectConfig = z.object({
  default: z.object({
    test: z.object({
      projects: z.array(
        z.looseObject({
          test: z.looseObject({
            name: z.string(),
            root: z.string(),
            include: z.array(z.string()),
          }),
        }),
      ),
    }),
  }),
});

function testFilesUnder(folder: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_FOLDERS.has(entry.name)) found.push(...testFilesUnder(join(folder, entry.name)));
    } else if (TEST_FILE.test(entry.name)) {
      found.push(relative(repositoryRoot, join(folder, entry.name)).replace(/\\/g, '/'));
    }
  }
  return found;
}

describe('test collection', () => {
  it('every test file in the repository is matched by a Vitest project include pattern', async () => {
    const loaded: unknown = await import(
      pathToFileURL(join(repositoryRoot, 'vitest.config.ts')).href
    );
    const projects = projectConfig.parse(loaded).default.test.projects;
    const collected = new Set(
      projects.flatMap((project) => {
        const cwd = join(repositoryRoot, project.test.root);
        return project.test.include
          .flatMap((pattern) => globSync(pattern, { cwd }))
          .map((file) => relative(repositoryRoot, join(cwd, file)).replace(/\\/g, '/'));
      }),
    );
    const orphaned = testFilesUnder(repositoryRoot).filter((file) => !collected.has(file));
    expect(orphaned).toEqual([]);
  });
});
