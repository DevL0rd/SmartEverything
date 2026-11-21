import { isBuiltin } from 'node:module';
import { join } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { BUNDLES } from '../service-bundles.ts';
import { repositoryRoot } from './repository-files';

const STORE_HOST = BUNDLES.find((bundle) => bundle.file === 'store-host.mjs');

const RUNTIME_PACKAGES = ['@deepseek-ai/dsh-session'];

const FOREIGN = [
  /^packages\/harness\/(?!src\/host\/authority\.ts$)/,
  /node_modules\/(?:\.pnpm\/)?@earendil-works\//,
  /node_modules\/(?:\.pnpm\/)?mime-types[@/]/,
  /^apps\/hub\/src\/drive\/file-type\.ts$/,
  /^apps\/hub\/src\/server\/router\.ts$/,
];

describe('the store host bundle', () => {
  it('holds the store code only, without the harness, the AI providers, file type lookup or the router', async () => {
    if (STORE_HOST === undefined) throw new Error('The service bundles have no store host.');
    const result = await build({
      entryPoints: [STORE_HOST.entry],
      bundle: true,
      write: false,
      outdir: join(repositoryRoot, 'tmp', 'store-host-bundle-guard'),
      platform: 'node',
      format: 'esm',
      target: 'node24',
      external: [...STORE_HOST.external],
      metafile: true,
      logLevel: 'silent',
    });
    const inputs = Object.keys(result.metafile.inputs);
    expect(inputs.filter((input) => FOREIGN.some((pattern) => pattern.test(input)))).toEqual([]);
    const loaded = Object.values(result.metafile.outputs).flatMap((output) =>
      output.imports
        .filter((imported) => imported.external === true && !isBuiltin(imported.path))
        .map((imported) => imported.path),
    );
    expect([...new Set(loaded)].sort()).toEqual(RUNTIME_PACKAGES);
  });
});
