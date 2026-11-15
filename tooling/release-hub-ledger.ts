import { randomUUID } from 'node:crypto';
import {
  HUB_HEALTHY,
  HUB_UNIT,
  HUB_UPDATE_LEDGER_FILE,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { join } from 'node:path';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import { readLedger, writeLedger } from './self-update-ledger.ts';
import type { Check } from './release-hub-verify.ts';

const log = new Logger('tool.release-hub');

export interface ReleasedHub {
  readonly data: HubLayout;
  readonly install: string;
  readonly notes: string;
  readonly url: string;
  readonly backup: string;
  readonly startingSchema: number | null;
  readonly changedDatabase: boolean;
  readonly checks: readonly Check[];
  readonly startedAt: Date;
  readonly finishedAt: Date;
}

export function releasedHubEntry(released: ReleasedHub, runId: string): HubUpdateRelease {
  const work = released.data.system.updates.selfUpdate;
  const finishedAt = released.finishedAt.toISOString();
  return {
    runId,
    phase: 'done',
    notes: released.notes,
    build: null,
    backup: released.backup,
    url: released.url,
    healthFile: join(work, HUB_HEALTHY),
    watchdogUnit: HUB_UNIT,
    startingSchema: released.startingSchema,
    changedDatabase: released.changedDatabase,
    installs: [released.install],
    checks: [...released.checks],
    failedChecks: [],
    reason: null,
    interrupted: false,
    revision: 0,
    startedAt: released.startedAt.toISOString(),
    updatedAt: finishedAt,
    finishedAt,
  };
}

export function recordReleasedHub(released: ReleasedHub): HubUpdateRelease {
  const file = join(released.data.system.updates.selfUpdate, HUB_UPDATE_LEDGER_FILE);
  const entry = releasedHubEntry(released, randomUUID());
  const ledger = readLedger(file);
  writeLedger(file, { releases: [...ledger.releases, entry] });
  log.info('release.recorded', { runId: entry.runId, ledger: file });
  return entry;
}
