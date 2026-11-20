import { extname } from 'node:path';
import { argv, env, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { Logger } from '@smarteverything/logging';
import { configuredLayout, layoutForLocation, resolveHubRootSync } from './data-layout';
import { applyFileIoThreads } from './service/file-io-threads';

const STARTUP_FAILED = 1;

interface ServiceMain {
  readonly startService: () => Promise<void>;
}

function isServiceMain(module: unknown): module is ServiceMain {
  return (
    typeof module === 'object' &&
    module !== null &&
    'startService' in module &&
    typeof module.startService === 'function'
  );
}

async function launch(): Promise<void> {
  if (argv.length === 2) {
    const location = resolveHubRootSync(env);
    const layout = configuredLayout(layoutForLocation(location, env));
    applyFileIoThreads(location.state === 'pending-v1' ? null : layout.system.database.file);
  }
  const extension = extname(fileURLToPath(import.meta.url));
  const main: unknown = await import(
    fileURLToPath(new URL(`./service-main${extension}`, import.meta.url))
  );
  if (!isServiceMain(main))
    throw new Error('The service main module does not export startService.');
  await main.startService();
}

launch().catch((cause: unknown) => {
  Logger.reset();
  Logger.configure({ style: 'plain' });
  new Logger('hub.service').exception('service.start_failed', cause);
  exit(STARTUP_FAILED);
});
