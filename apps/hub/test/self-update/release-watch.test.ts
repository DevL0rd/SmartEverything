import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { HUB_UPDATE_LEDGER_FILE, type HubUpdateRelease } from '@smarteverything/domain';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ReleaseWatch } from '../../src/self-update/release-watch';
import { testLayout } from '../support/test-layout';
import type { HubLayout } from '../../src/data-layout';

const RUN = '00000000-0000-4000-8000-000000000001';
const AT = '2026-11-14T10:00:00.000Z';

let scratch: string;
let layout: HubLayout;
let watch: ReleaseWatch;
let failures: unknown[];

function release(phase: HubUpdateRelease['phase']): HubUpdateRelease {
  return {
    runId: RUN,
    phase,
    notes: 'Notes',
    build: null,
    backup: null,
    url: 'http://127.0.0.1:7880',
    healthFile: '/tmp/health',
    watchdogUnit: 'unit',
    startingSchema: null,
    changedDatabase: false,
    installs: [],
    checks: [],
    failedChecks: [],
    reason: null,
    interrupted: false,
    revision: 0,
    startedAt: AT,
    updatedAt: AT,
    finishedAt: null,
  };
}

function writeLedger(...releases: HubUpdateRelease[]): Promise<void> {
  return writeFile(
    join(layout.system.updates.selfUpdate, HUB_UPDATE_LEDGER_FILE),
    JSON.stringify({ releases }),
  );
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'release-watch-'));
  layout = await testLayout(scratch);
  failures = [];
  watch = new ReleaseWatch(layout, (cause) => failures.push(cause));
  await watch.start();
});

afterEach(async () => {
  await watch.stop();
  await rm(scratch, { recursive: true, force: true });
});

it('resolves when the ledger shows the release reached a final phase, not before', async () => {
  let settled = false;
  const finished = watch.finished(RUN).then((value) => {
    settled = true;
    return value;
  });
  await writeLedger(release('restarting'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(settled).toBe(false);
  await writeLedger(release('reverted'));
  expect((await finished).phase).toBe('reverted');
  expect(failures).toEqual([]);
});

it('resolves at once for a release that already finished', async () => {
  await writeLedger(release('done'));
  expect((await watch.finished(RUN)).phase).toBe('done');
});
