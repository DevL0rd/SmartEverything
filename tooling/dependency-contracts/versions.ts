import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(here, '..', '..');

export function repositoryFile(relativePath: string): string {
  return join(repositoryRoot, relativePath);
}

export function installedVersion(packageName: string): string {
  const resolved = join(repositoryRoot, 'node_modules', packageName, 'package.json');
  const raw: unknown = JSON.parse(readFileSync(resolved, 'utf8'));
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) {
    throw new Error(`Expected ${resolved} to declare a version`);
  }
  const version: unknown = raw.version;
  if (typeof version !== 'string') {
    throw new Error(`Expected ${resolved} version to be a string`);
  }
  return version;
}
