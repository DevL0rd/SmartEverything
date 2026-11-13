import { readFile } from 'node:fs/promises';
import { argv, env, exit, pid } from 'node:process';
import { parseArgs } from 'node:util';
import {
  CLIENT_TOKEN,
  COMPUTER_DATA_DIRECTORY_VARIABLE,
  COMPUTER_FILES,
  COMPUTER_SERVICE_CONFIG,
  HUB_FINGERPRINT,
  RESTART_EXIT_CODE,
  SUPERVISE_ARGUMENT,
  isAbsolutePath,
  type ComputerServiceConfig,
} from '@smarteverything/domain';
import { join } from 'node:path';
import { Logger, background } from '@smarteverything/logging';
import { z } from 'zod';
import { nodeLayout, type NodeLayout } from '../../../hub/src/data-layout';
import { startNode } from '../../../hub/src/node/bootstrap';
import { pairNode } from '../../../hub/src/node/setup';
import { configureComputerHttp } from '../../../hub/src/node/http-runtime';
import {
  clearRequest,
  openLogFile,
  watchRequest,
  writePidFile,
} from '../../../hub/src/service/files';
import { COMPUTER_PAIRING_WINDOW_TOKEN } from '../../src/package-layout';
import { supervise } from './supervise';

const log = new Logger('hub.computer');

class NodeSetupArgumentsError extends Error {
  override readonly name = 'NodeSetupArgumentsError';

  constructor() {
    super('Computer pairing requires --hub <url> and --code <code>, with --pin <pin> for HTTPS.');
  }
}

const COMPUTER_DIRECTORY = z
  .string({ error: `${COMPUTER_DATA_DIRECTORY_VARIABLE} must name the computer data folder` })
  .refine(isAbsolutePath, {
    error: `${COMPUTER_DATA_DIRECTORY_VARIABLE} must be an absolute path`,
  });

async function readComputerConfig(file: string): Promise<ComputerServiceConfig> {
  return COMPUTER_SERVICE_CONFIG.parse(JSON.parse(await readFile(file, 'utf8')));
}

function pair(node: NodeLayout): Promise<void> {
  const { values } = parseArgs({
    args: argv.slice(2),
    options: {
      'pair-node': { type: 'boolean' },
      hub: { type: 'string' },
      code: { type: 'string' },
      pin: { type: 'string' },
    },
  });
  const pin = HUB_FINGERPRINT.optional().safeParse(values.pin);
  if (
    values.hub === undefined ||
    values.code === undefined ||
    !pin.success ||
    (pin.data === undefined && values.hub.startsWith('https:'))
  ) {
    throw new NodeSetupArgumentsError();
  }
  return pairNode({
    layout: node,
    hubUrl: values.hub,
    code: values.code,
    pin: pin.data,
    windowToken: CLIENT_TOKEN.optional().parse(env[COMPUTER_PAIRING_WINDOW_TOKEN]),
  });
}

async function serve(node: NodeLayout): Promise<void> {
  const config = await readComputerConfig(node.config);
  const logs = await openLogFile(node.logs.service);
  Logger.configure({ level: config.logLevel, sink: logs.sink });
  const pidFile = await writePidFile(join(node.root, COMPUTER_FILES.servicePid), pid);
  let stopping = false;
  const running = await startNode({ layout: node, config, log }).catch(async (error: unknown) => {
    await pidFile.remove();
    await logs.close();
    throw error;
  });
  const watch = await watchRequest(node.restartRequest, {
    requested: () => {
      stop(RESTART_EXIT_CODE);
    },
    failed: (error) => {
      log.error('computer.restart_watch_failed', error);
    },
  });
  function stop(code: number): void {
    if (stopping) return;
    stopping = true;
    watch.stop();
    background(
      shutdownComputer(
        { restartRequest: node.restartRequest, stop: running.stop, pidFile, logs },
        code,
      ),
      'computer.shutdown_failed',
    );
  }
  process.once('SIGTERM', () => {
    stop(0);
  });
  process.once('SIGINT', () => {
    stop(0);
  });
}

interface ComputerShutdown {
  readonly restartRequest: string;
  readonly stop: () => Promise<void>;
  readonly pidFile: { readonly remove: () => Promise<void> };
  readonly logs: { readonly close: () => Promise<void> };
}

async function shutdownComputer(parts: ComputerShutdown, code: number): Promise<void> {
  try {
    await parts.stop();
  } finally {
    await clearRequest(parts.restartRequest);
    await parts.pidFile.remove();
    await parts.logs.close();
    exit(code);
  }
}

async function main(): Promise<void> {
  configureComputerHttp();
  const node = nodeLayout(COMPUTER_DIRECTORY.parse(env[COMPUTER_DATA_DIRECTORY_VARIABLE]));
  if (argv.includes('--pair-node')) return pair(node);
  if (argv.includes(SUPERVISE_ARGUMENT)) return supervise(node.root);
  return serve(node);
}

main().catch((cause: unknown) => {
  Logger.reset();
  Logger.configure({ style: 'plain' });
  log.exception('computer.start_failed', cause);
  exit(1);
});
