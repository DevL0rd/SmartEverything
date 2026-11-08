import { spawn } from 'node:child_process';
import { argv, env, execPath, exit, kill, pid } from 'node:process';
import { join } from 'node:path';
import { COMPUTER_FILES } from '@smarteverything/domain';
import { runSupervisor, type ServiceChild } from '../../../hub/src/service/supervisor';

const RETRY_MS = 5_000;
const STOP_GRACE_MS = 30_000;

class MissingComputerEntryError extends Error {
  override readonly name = 'MissingComputerEntryError';

  constructor() {
    super('The computer supervisor requires the computer entry path.');
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

function spawnComputer(entry: string): ServiceChild {
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

export function supervise(directory: string): Promise<void> {
  const entry = argv[1];
  if (entry === undefined) throw new MissingComputerEntryError();
  return runSupervisor({
    files: {
      supervisorPid: join(directory, COMPUTER_FILES.supervisorPid),
      restartRequest: join(directory, COMPUTER_FILES.restartRequest),
      stopRequest: join(directory, COMPUTER_FILES.stopRequest),
      ready: join(directory, COMPUTER_FILES.ready),
      output: join(directory, COMPUTER_FILES.serviceOutputLog),
    },
    pid,
    spawnService: () => spawnComputer(entry),
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
