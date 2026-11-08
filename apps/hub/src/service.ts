import process, { argv, env, exit } from 'node:process';
import { Logger } from '@smarteverything/logging';
import { hubLayout, resolveHubRoot } from './data-layout';
import { runService } from './service/runner';

const STARTUP_FAILED = 1;

async function start(): Promise<void> {
  if (argv.length > 2) throw new Error('The standalone hub accepts no service arguments.');
  const location = await resolveHubRoot(env);
  await runService({
    layout: hubLayout(location.root, env),
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
