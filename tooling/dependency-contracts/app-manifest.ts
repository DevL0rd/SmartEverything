import { readFileSync } from 'node:fs';
import { repositoryFile } from './versions';

interface Manifest {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

function readAppManifest(): Manifest {
  const raw: unknown = JSON.parse(readFileSync(repositoryFile('apps/app/package.json'), 'utf8'));
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('apps/app/package.json must contain an object');
  }
  return raw;
}

export function appDeclaredVersion(packageName: string): string {
  const manifest = readAppManifest();
  const declared = manifest.dependencies?.[packageName] ?? manifest.devDependencies?.[packageName];
  if (declared === undefined) {
    throw new Error(`Package "${packageName}" is not declared in apps/app/package.json`);
  }
  return declared;
}

export function appDeclaredPackageNames(): readonly string[] {
  const manifest = readAppManifest();
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ].sort();
}
