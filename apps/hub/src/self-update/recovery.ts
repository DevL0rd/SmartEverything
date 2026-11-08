import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HubLayout } from '../data-layout';
import {
  HUB_UPDATE_LEDGER,
  HUB_UPDATE_LEDGER_FILE,
  releaseOf,
  type HubUpdateLedger,
  type HubUpdateRelease,
  type SelfUpdateRecoveryStatus,
} from '@smarteverything/domain';

async function ledgerText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
    throw cause;
  }
}

export async function readHubUpdateLedger(layout: HubLayout): Promise<HubUpdateLedger> {
  const text = await ledgerText(join(layout.system.updates.selfUpdate, HUB_UPDATE_LEDGER_FILE));
  return text === null ? { releases: [] } : HUB_UPDATE_LEDGER.parse(JSON.parse(text));
}

export async function readHubUpdate(
  layout: HubLayout,
  runId?: string,
): Promise<HubUpdateRelease | null> {
  const ledger = await readHubUpdateLedger(layout);
  return (runId === undefined ? ledger.releases.at(-1) : releaseOf(ledger, runId)) ?? null;
}

export function hubUpdateStatusOf(release: HubUpdateRelease | undefined): SelfUpdateRecoveryStatus {
  if (release === undefined) return { release: null };
  const { runId, phase, interrupted, startedAt, updatedAt, finishedAt } = release;
  return { release: { runId, phase, interrupted, startedAt, updatedAt, finishedAt } };
}

export async function hubUpdateStatus(layout: HubLayout): Promise<SelfUpdateRecoveryStatus> {
  const { releases } = await readHubUpdateLedger(layout);
  return hubUpdateStatusOf(releases.at(-1));
}
