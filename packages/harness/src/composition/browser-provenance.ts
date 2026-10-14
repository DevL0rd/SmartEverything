import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { HarnessRuntimeError } from '../host/errors';
import { BROWSER_PACKAGES } from './browser-provenance-data';
import { verifyPackageVersion } from './indexer-provenance';

const requirePackage = createRequire(import.meta.url);

export async function verifyBrowserPackages(): Promise<void> {
  for (const expected of BROWSER_PACKAGES) {
    await verifyPackageVersion(expected.package, expected.version);
    const root = dirname(requirePackage.resolve(`${expected.package}/package.json`));
    const hash = createHash('sha256');
    for (const file of expected.files)
      hash
        .update(file)
        .update('\0')
        .update(await readFile(join(root, file)))
        .update('\0');
    if (hash.digest('hex') !== expected.sha256)
      throw new HarnessRuntimeError(
        'composition_incompatible',
        `Installed ${expected.package} differs from the pinned browser artifact.`,
      );
  }
  verifyBrowserPeers();
}

function verifyBrowserPeers(): void {
  const browserRequire = createRequire(
    requirePackage.resolve('@deepseek-ai/dsh-experimental-browser-use-runtime/package.json'),
  );
  for (const peer of ['@deepseek-ai/dsh-scope', '@deepseek-ai/dsh-mcp-client'])
    if (browserRequire.resolve(peer) !== requirePackage.resolve(peer))
      throw new HarnessRuntimeError(
        'composition_incompatible',
        `Browser runtime ${peer} must share the host's scoped registry identity.`,
      );
}
