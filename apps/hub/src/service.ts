import process, { argv, env, exit } from 'node:process';
import { Logger } from '@smarteverything/logging';
import { layoutForLocation, resolveHubRoot, type Location } from './data-layout';
import {
  PREPARE_DATA_ARGUMENT,
  preparationLayout,
  prepareHubData,
} from './service/data-preparation';
import { runService } from './service/runner';

const STARTUP_FAILED = 1;

async function prepare(
  layout: Awaited<ReturnType<typeof preparationLayout>>,
  location?: Pick<Location, 'rootId' | 'state'>,
): Promise<void> {
  const abort = new AbortController();
  const stop = (): void => {
    abort.abort(new Error('Hub data preparation was interrupted.'));
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await prepareHubData(layout, new Logger('hub.data-preparation'), {
      signal: abort.signal,
      ...(location === undefined ? {} : { location }),
    });
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}

async function start(): Promise<void> {
  if (argv[2] === PREPARE_DATA_ARGUMENT && argv.length === 4) {
    const root = argv[3];
    if (root === undefined) throw new Error('The data preparation root is missing.');
    await prepare(await preparationLayout(root, env));
    return;
  }
  if (argv.length > 2)
    throw new Error('Use --prepare-data <absolute data root> or no service arguments.');
  const location = await resolveHubRoot(env);
  const layout = layoutForLocation(location, env);
  await prepare(layout, location);
  await runService({
    layout,
    pointer: location,
    exit,
    onSignal: (signal, handler) => {
      process.once(signal, handler);
    },
  });
}

start().catch((cause: unknown) => {
  Logger.reset();
  Logger.configure({ style: 'plain' });
  new Logger('hub.service').exception('service.start_failed', cause);
  exit(STARTUP_FAILED);
});
