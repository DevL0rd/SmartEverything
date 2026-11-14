import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HUB_REQUEST_TIMEOUT_MS } from '@smarteverything/domain';
import { HUB_NODE_EXECUTABLE } from './hub-install-layout.ts';
import { updateUnitRunning } from './self-update-watchdog-start.ts';

const PREPARATION_TIMEOUT_MS = 30 * 60 * 1000;

function preparationUnit(runId: string): string {
  return `smarteverything-hub-prepare-${runId}.service`;
}

export function remotePreparationRunning(runId: string): boolean {
  return updateUnitRunning(preparationUnit(runId));
}

export function startRemotePreparation(data: string, install: string, runId: string): void {
  const root = process.cwd();
  const launched = spawnSync(
    'systemd-run',
    [
      '--user',
      '--collect',
      `--unit=${preparationUnit(runId)}`,
      '--property=Type=exec',
      `--property=RuntimeMaxSec=${String(PREPARATION_TIMEOUT_MS / 1000)}s`,
      `--working-directory=${root}`,
      `--setenv=SMARTEVERYTHING_SELF_UPDATE_INSTALL=${install}`,
      '--',
      join(install, HUB_NODE_EXECUTABLE),
      '--import',
      'tsx',
      join(root, 'tooling', 'self-update-hub-command.ts'),
      data,
      JSON.stringify({ action: 'prepare_remote', runId }),
    ],
    { encoding: 'utf8', timeout: HUB_REQUEST_TIMEOUT_MS / 2 },
  );
  if (launched.status !== 0)
    throw new Error('The hub could not start release preparation.', { cause: launched.error });
}
