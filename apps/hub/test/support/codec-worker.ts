import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const SOURCE = fileURLToPath(new URL('../../src/codec/worker.ts', import.meta.url));

const ESM_BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; const require = createServiceRequire(import.meta.url);';

export async function bundledCodecWorker(directory: string): Promise<string> {
  const script = join(directory, 'codec-worker.mjs');
  await build({
    entryPoints: [SOURCE],
    outfile: script,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    banner: { js: ESM_BANNER },
    logLevel: 'silent',
  });
  return script;
}
