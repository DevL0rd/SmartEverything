import { constants } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { DATABASE_FILE } from '@smarteverything/hub/service/configuration';
import type { MigrationHost } from './host.js';
import type { MigrationPlan } from './plan.js';
import { readFacts, waitForNewServer, type HubFacts } from './probe.js';

const DATABASE_PARTS = ['', '-wal', '-shm'];

export type Report = (line: string) => void;

export interface SwitchTiming {
  readonly readyTimeoutMs: number;
  readonly settleMs: number;
}

export class VerificationError extends Error {
  override readonly name = 'VerificationError';
}

function missing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

async function backupDatabase(host: MigrationHost, plan: MigrationPlan): Promise<string> {
  const stamp = host.now().toISOString().replaceAll(/[:.]/gu, '-');
  const base = path.join(plan.launch.dataDirectory, DATABASE_FILE);
  for (const part of DATABASE_PARTS) {
    await copyFile(
      `${base}${part}`,
      `${base}.pre-system-${stamp}${part}`,
      constants.COPYFILE_EXCL,
    ).catch((cause: unknown) => {
      if (part === '' || !missing(cause)) {
        throw cause;
      }
    });
  }
  return `${base}.pre-system-${stamp}`;
}

export async function unitProperty(
  host: MigrationHost,
  unit: string,
  property: string,
): Promise<string> {
  return (await host.inspect(['show', unit, `--property=${property}`, '--value'])).trim();
}

async function intoSystem(host: MigrationHost, plan: MigrationPlan): Promise<void> {
  for (const move of plan.moves) {
    await host.userctl(['disable', move.name]);
    await host.installUnit(move.files.system, move.systemText, plan.launch.dataDirectory);
  }
  await host.elevated(['daemon-reload']);
  for (const move of plan.moves) {
    await host.elevated(['enable', '--now', move.name]);
  }
}

function sameHome(before: HubFacts, after: HubFacts): void {
  const differences = (['devices', 'providerLinks', 'publicUrl'] as const).filter(
    (key) => before[key] !== after[key],
  );
  if (differences.length > 0) {
    throw new VerificationError(
      `the system service differs from before in ${differences.map((key) => `${key} (${String(before[key])} → ${String(after[key])})`).join(', ')}`,
    );
  }
}

async function verify(
  host: MigrationHost,
  plan: MigrationPlan,
  before: HubFacts,
  timing: SwitchTiming,
): Promise<HubFacts> {
  await waitForNewServer(host.system, plan.locations, before.pid, timing.readyTimeoutMs);
  const after = await readFacts(host.system, plan.locations);
  sameHome(before, after);
  await host.sleep(timing.settleMs);
  for (const move of plan.moves) {
    const state = await unitProperty(host, move.name, 'ActiveState');
    const restarts = await unitProperty(host, move.name, 'NRestarts');
    if (state !== 'active' || restarts !== '0') {
      throw new VerificationError(`${move.name} is ${state} after ${restarts} restarts`);
    }
  }
  return after;
}

export interface SwitchRun {
  readonly plan: MigrationPlan;
  readonly before: HubFacts;
  readonly timing: SwitchTiming;
}

export async function switchToSystem(
  host: MigrationHost,
  { plan, before, timing }: SwitchRun,
  report: Report,
): Promise<HubFacts> {
  for (const move of plan.moves) {
    await host.userctl(['stop', move.name]);
  }
  report('Stopped the user service.');
  report(`Saved the database to ${await backupDatabase(host, plan)}.`);
  await intoSystem(host, plan);
  report('Started the system service.');
  const after = await verify(host, plan, before, timing);
  report(`After: ${describe(after)}`);
  return after;
}

export function describe(facts: HubFacts): string {
  return `version ${facts.version}, ${String(facts.devices)} devices, ${String(facts.providerLinks)} provider links, public URL ${facts.publicUrl}`;
}
