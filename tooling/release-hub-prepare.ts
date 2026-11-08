import { spawn } from 'node:child_process';
import process from 'node:process';
import { lockDataDirectory } from '../apps/hub/src/data-lock.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import { join } from 'node:path';
import {
  HUB_NODE_EXECUTABLE,
  HUB_SERVICE_DIRECTORY,
  HUB_SERVICE_ENTRY,
} from './hub-install-layout.ts';

export function dataPreparationCommand(
  install: string,
  data: string,
): {
  readonly executable: string;
  readonly args: readonly string[];
} {
  return {
    executable: join(install, HUB_NODE_EXECUTABLE),
    args: [join(install, HUB_SERVICE_DIRECTORY, HUB_SERVICE_ENTRY), '--prepare-data', data],
  };
}

export function prepareHubData(install: string, data: string): Promise<void> {
  const command = dataPreparationCommand(install, data);
  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, [...command.args], { stdio: 'inherit' });
    let interrupted = false;
    const interrupt = (): void => {
      interrupted = true;
      child.kill('SIGINT');
    };
    const terminate = (): void => {
      interrupted = true;
      child.kill('SIGTERM');
    };
    const cleanup = (): void => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', terminate);
    };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', terminate);
    child.once('error', (cause) => {
      cleanup();
      reject(cause);
    });
    child.once('exit', (code, signal) => {
      cleanup();
      if (code === 0 && !interrupted) resolve();
      else
        reject(
          new Error(
            `Hub data preparation failed (${interrupted ? 'interrupted' : (signal ?? String(code))}).`,
          ),
        );
    });
  });
}

export async function withHubDataLock<T>(root: string, work: () => Promise<T>): Promise<T> {
  const lock = await lockDataDirectory(dataLayoutOf(root));
  try {
    return await work();
  } finally {
    await lock.release();
  }
}
