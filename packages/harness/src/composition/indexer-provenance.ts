import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { HarnessRuntimeError } from '../host/errors';
import { CODEGRAPH_PACKAGES, CODEGRAPH_PATCH_SHA256 } from './indexer-provenance-data';

const requirePackage = createRequire(import.meta.url);
const PACKAGE_IDENTITY = z.object({ name: z.string(), version: z.string() });
export const CODEGRAPH_PROVENANCE = `npm-codegraph@0.1.6+sha256:${CODEGRAPH_PATCH_SHA256}`;

export async function verifyCodegraphPackages(): Promise<void> {
  for (const expected of CODEGRAPH_PACKAGES) {
    const path = requirePackage.resolve(`${expected.package}/package.json`);
    await verifyPackageVersion(expected.package, expected.version);
    const hash = createHash('sha256');
    for (const file of expected.files) {
      hash.update(file).update('\0');
      hash.update(await readFile(join(dirname(path), file))).update('\0');
    }
    if (hash.digest('hex') !== expected.sha256)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        `Installed ${expected.package} differs from the trusted compatibility artifact.`,
      );
  }
  await verifyPackageVersion('web-tree-sitter', '0.25.10');
  await verifyPackageVersion('tree-sitter-wasms', '0.1.13');
}

export async function verifyPackageVersion(name: string, version: string): Promise<void> {
  const path = await packageManifestPath(name);
  const identity = PACKAGE_IDENTITY.parse(JSON.parse(await readFile(path, 'utf8')));
  if (identity.name !== name || identity.version !== version)
    throw new HarnessRuntimeError(
      'composition_incompatible',
      `Installed ${name} must be exactly ${version}; received ${identity.name}@${identity.version}.`,
    );
}

function exportedManifestPath(name: string): string | undefined {
  try {
    return requirePackage.resolve(`${name}/package.json`);
  } catch (error) {
    if (!(
      error instanceof Error &&
      'code' in error &&
      error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    ))
      throw error;
    return undefined;
  }
}

async function packageManifestPath(name: string): Promise<string> {
  const exported = exportedManifestPath(name);
  if (exported !== undefined) return exported;
  let directory = dirname(requirePackage.resolve(name));
  for (;;) {
    const candidate = join(directory, 'package.json');
    try {
      const identity = PACKAGE_IDENTITY.parse(JSON.parse(await readFile(candidate, 'utf8')));
      if (identity.name === name) return candidate;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const parent = dirname(directory);
    if (parent === directory)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        `Installed ${name} manifest is absent.`,
      );
    directory = parent;
  }
}
