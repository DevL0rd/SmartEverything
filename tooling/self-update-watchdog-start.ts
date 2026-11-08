import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { WatchdogOptions } from './self-update-watchdog-contract.ts';

export interface Arm {
  readonly node: string;
  readonly entry: string;
  readonly agent: string;
  readonly options: WatchdogOptions;
}

export function watchdogUnit(runId: string): string {
  return `smarteverything-hub-update-${runId}.service`;
}

export function watchdogRunning(runId: string): boolean {
  return updateUnitRunning(watchdogUnit(runId));
}

export function updateUnitRunning(unit: string): boolean {
  const existing = spawnSync(
    'systemctl',
    ['--user', 'show', unit, '--property=ActiveState', '--value'],
    { encoding: 'utf8' },
  );
  return existing.status === 0 && /^(active|activating|reloading)$/u.test(existing.stdout.trim());
}

export function arm(start: Arm): string {
  const unit = watchdogUnit(start.options.runId);
  if (watchdogRunning(start.options.runId)) return unit;

  const entry = pathToFileURL(start.entry).href;
  const script = [
    `import { resume } from ${JSON.stringify(entry)};`,
    `await resume(${JSON.stringify(JSON.stringify(start.options))});`,
    '',
  ].join('\n');
  writeFileSync(start.agent, script, { mode: 0o600 });
  const launched = spawnSync(
    'systemd-run',
    [
      '--user',
      '--collect',
      `--unit=${unit}`,
      '--property=Type=exec',
      '--property=Restart=on-failure',
      '--',
      start.node,
      start.agent,
    ],
    { encoding: 'utf8' },
  );
  if (launched.status !== 0)
    throw new Error(
      `Could not start the independent hub update service: ${launched.error?.message ?? launched.stderr.trim()}`,
    );
  return unit;
}
