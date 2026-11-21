import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { LogStore } from '../../src/logs/log-store';
import { hostRepairInbox } from '../../src/store/host/hosted';
import type { SeededStore } from './store';
import { testLogger } from './logs';

const SOURCE = fileURLToPath(new URL('../../src/logs/worker.ts', import.meta.url));

const ESM_BANNER =
  'import { createRequire as createServiceRequire } from "node:module"; const require = createServiceRequire(import.meta.url);';

export async function bundledLogWorker(directory: string): Promise<string> {
  const script = join(directory, 'log-worker.mjs');
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

export async function testLogStore(
  directory: string,
  store: Pick<SeededStore, 'host' | 'now'>,
): Promise<LogStore> {
  return LogStore.open({
    path: join(directory, 'runtime-logs.db'),
    workerScript: await bundledLogWorker(directory),
    repairs: hostRepairInbox(store.host),
    now: store.now,
    log: testLogger('logs'),
    fatal: (cause) => {
      throw cause;
    },
  });
}
