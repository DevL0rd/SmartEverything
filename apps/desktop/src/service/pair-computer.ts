import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from 'node:process';
import { Logger } from '@smarteverything/logging';
import { app } from 'electron';
import {
  COMPUTER_DATA_DIRECTORY_VARIABLE,
  type ComputerNodePairing,
} from '@smarteverything/domain';
import { COMPUTER_PAIRING_WINDOW_TOKEN } from '../package-layout.js';
import { desktopPaths, type DesktopPaths } from '../paths.js';
import type { DesktopVariant } from '../variant.js';
import { createDesktopService, currentPlatform } from './desktop-service.js';
import { setStartOnLogin } from '../start-on-login.js';

const run = promisify(execFile);

class ComputerPairingError extends Error {
  override readonly name = 'ComputerPairingError';

  constructor(message = 'Computer pairing failed. Check the Hub URL, pairing code and pin.') {
    super(message);
  }
}

export async function pairComputer(
  paths: DesktopPaths,
  variant: DesktopVariant,
  args: readonly string[],
  windowToken?: string,
): Promise<void> {
  const { controller } = createDesktopService(currentPlatform(), paths, variant, (error) => {
    throw error;
  });
  await run(paths.serviceExecutable, [paths.serviceEntry, ...args], {
    env: {
      ...env,
      [COMPUTER_DATA_DIRECTORY_VARIABLE]: paths.dataDirectory,
      [COMPUTER_PAIRING_WINDOW_TOKEN]: windowToken,
    },
    windowsHide: true,
  }).catch(() => {
    throw new ComputerPairingError();
  });
  const before = await controller.status();
  await controller.ensure('pairing');
  if (!before.installed) setStartOnLogin(true);
}

export function computerPairingArguments(pairing: ComputerNodePairing): readonly string[] {
  return [
    '--pair-node',
    '--hub',
    pairing.url,
    '--code',
    pairing.code,
    ...(pairing.pin === null ? [] : ['--pin', pairing.pin]),
  ];
}

export function handleComputerPairingCommand(variant: DesktopVariant): boolean {
  if (variant.managedBy !== undefined || !process.argv.includes('--pair-node')) return false;
  pairComputer(desktopPaths(), variant, process.argv.slice(1)).then(
    () => {
      app.exit(0);
    },
    (error: unknown) => {
      new Logger('desktop.service').error('computer.pair_failed', error);
      app.exit(1);
    },
  );
  return true;
}
