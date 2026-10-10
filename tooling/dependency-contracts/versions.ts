import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(here, '..', '..');
const manifestPath = join(repositoryRoot, 'package.json');

export function repositoryFile(relativePath: string): string {
  return join(repositoryRoot, relativePath);
}

interface Manifest {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

function readManifest(): Manifest {
  const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`Expected ${manifestPath} to contain an object`);
  }
  return raw;
}

export function declaredVersion(packageName: string): string {
  const manifest = readManifest();
  const declared = manifest.dependencies?.[packageName] ?? manifest.devDependencies?.[packageName];
  if (declared === undefined) {
    throw new Error(`Package "${packageName}" is not declared in ${manifestPath}`);
  }
  return declared;
}

export function declaredPackageNames(): readonly string[] {
  const manifest = readManifest();
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ].sort();
}

export function installedVersion(packageName: string): string {
  const resolved = join(here, '..', '..', 'node_modules', packageName, 'package.json');
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
