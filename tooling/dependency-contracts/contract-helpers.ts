import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { workspaceManifests } from '../pinned-versions';
import { installedVersion, repositoryFile } from './versions';

export const ROOT_MANIFEST = 'package.json';

export const APP_MANIFEST = 'apps/app/package.json';

export const HUB_MANIFEST = 'apps/hub/package.json';

const MANIFEST = z.looseObject({
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
});

export function readRepositoryJson<TSchema extends z.ZodType>(
  relativePath: string,
  schema: TSchema,
): z.infer<TSchema> {
  return schema.parse(JSON.parse(readFileSync(repositoryFile(relativePath), 'utf8')));
}

export function declaredVersion(manifest: string, packageName: string): string {
  const { dependencies, devDependencies } = readRepositoryJson(manifest, MANIFEST);
  const declared = dependencies[packageName] ?? devDependencies[packageName];
  if (declared === undefined) {
    throw new Error(`Package "${packageName}" is not declared in ${manifest}`);
  }
  return declared;
}

export function declaredPackageNames(manifest: string): readonly string[] {
  const { dependencies, devDependencies } = readRepositoryJson(manifest, MANIFEST);
  return [...Object.keys(dependencies), ...Object.keys(devDependencies)].sort();
}

export function itMatchesTheVersionOf(packageName: string, peerName: string): void {
  it(`matches the ${peerName} version, which it requires`, () => {
    expect(installedVersion(packageName)).toBe(installedVersion(peerName));
  });
}

export function workspaceManifestPaths(): readonly string[] {
  return workspaceManifests(repositoryFile('.'));
}
