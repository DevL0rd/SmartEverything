import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { TestProject } from 'vitest/node';
import { SERVICE_EXTERNALS } from './service-bundles.ts';

const SOURCE = fileURLToPath(new URL('../apps/hub/src/store/host/worker.ts', import.meta.url));
const SCRATCH = fileURLToPath(new URL('../tmp/test-store-host', import.meta.url));

const ESM_BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; const require = createServiceRequire(import.meta.url);';

declare module 'vitest' {
  export interface ProvidedContext {
    readonly storeHostScript: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  await mkdir(SCRATCH, { recursive: true });
  const directory = await mkdtemp(join(SCRATCH, 'run-'));
  const script = join(directory, 'store-host.mjs');
  await build({
    entryPoints: [SOURCE],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: SERVICE_EXTERNALS,
    banner: { js: ESM_BANNER },
    logLevel: 'silent',
  });
  project.provide('storeHostScript', script);
  return async (): Promise<void> => {
    await rm(directory, { recursive: true, force: true });
  };
}
