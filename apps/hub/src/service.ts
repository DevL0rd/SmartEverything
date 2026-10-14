import { spawn } from 'node:child_process';
import process, { argv, env, execPath, exit, kill, pid } from 'node:process';
import { Logger } from '@smarteverything/logging';
import { SUPERVISE_ARGUMENT, dataDirectoryFrom } from './service/configuration';
import { parseArgs } from 'node:util';
import { pairNode, pairNodeWindow } from './node/setup';
import { runService } from './service/runner';
import { runSupervisor, type ServiceChild } from './service/supervisor';

const STARTUP_FAILED = 1;
const RETRY_MS = 5000;
const STOP_GRACE_MS = 30_000;

class MissingEntryError extends Error {
  override readonly name = 'MissingEntryError';

  constructor() {
    super(
      'The supervisor is started as "<runtime> <service entry> --supervise"; no entry was given.',
    );
  }
}

class NodeSetupArgumentsError extends Error {
  override readonly name = 'NodeSetupArgumentsError';
  constructor() {
    super('Node setup requires --hub <central hub URL> and --code <owner-issued pairing code>.');
  }
}

function isAlive(processId: number): boolean {
  try {
    kill(processId, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

function spawnService(entry: string): ServiceChild {
  const child = spawn(execPath, [entry], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    kill: (): void => {
      child.kill();
    },
    onExit: (listener): void => {
      child.once('exit', listener);
    },
    onError: (listener): void => {
      child.once('error', listener);
    },
  };
}

function supervise(dataDirectory: string): Promise<void> {
  const entry = argv[1];
  if (entry === undefined) {
    throw new MissingEntryError();
  }
  return runSupervisor({
    dataDirectory,
    pid,
    spawnService: () => spawnService(entry),
    isAlive,
    exit,
    later: (run, delayMs) => {
      const timer = setTimeout(run, delayMs);
      return (): void => {
        clearTimeout(timer);
      };
    },
    retryMs: RETRY_MS,
    stopGraceMs: STOP_GRACE_MS,
  });
}

function start(): Promise<unknown> {
  const dataDirectory = dataDirectoryFrom(env);
  if (argv.includes('--pair-node') || argv.includes('--pair-node-window')) {
    const { values } = parseArgs({
      args: argv.slice(2),
      options: {
        'pair-node': { type: 'boolean' },
        'pair-node-window': { type: 'boolean' },
        hub: { type: 'string' },
        code: { type: 'string' },
      },
    });
    if (values.hub === undefined || values.code === undefined) {
      throw new NodeSetupArgumentsError();
    }
    const options = { dataDirectory, hubUrl: values.hub, code: values.code };
    return values['pair-node-window'] === true ? pairNodeWindow(options) : pairNode(options);
  }
  if (argv.includes(SUPERVISE_ARGUMENT)) {
    return supervise(dataDirectory);
  }
  return runService({
    dataDirectory,
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
