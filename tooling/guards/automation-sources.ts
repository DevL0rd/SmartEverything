import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repositoryRoot } from './repository-files';

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'dist-types',
  'coverage',
  'android',
  'ios',
  '.cache',
  '.expo',
  '.stryker-tmp',
]);

const SOURCE_FILE = /\.(?:ts|tsx)$/;

const TEST_FILE = /(?:\.test\.tsx?$|\/test\/|\/test-support\/)/;

function walk(directory: string, found: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(join(directory, entry.name), found);
    } else if (SOURCE_FILE.test(entry.name)) {
      found.push(join(directory, entry.name));
    }
  }
}

export function repositorySourcePaths(): readonly string[] {
  const found: string[] = [];
  for (const top of ['apps', 'packages', 'tooling']) walk(join(repositoryRoot, top), found);
  return found.map((file) => relative(repositoryRoot, file).replace(/\\/g, '/')).sort();
}

export function isTestPath(path: string): boolean {
  return TEST_FILE.test(`/${path}`);
}
