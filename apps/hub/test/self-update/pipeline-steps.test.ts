import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  HUB_UPDATE_LEDGER_FILE,
  type HubUpdateRelease,
  type UpdateRevision,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubLayout } from '../../src/data-layout';
import { UpdateBusyError } from '../../src/self-update/command';
import {
  executeHub,
  movedPastPlan,
  publicationInput,
  publishedOutcome,
  untilIdle,
  whenIdle,
  type StepDependencies,
} from '../../src/self-update/pipeline-steps';
import { withHubReleaseLock } from '../../src/self-update/release-lock';
import { testLayout } from '../support/test-layout';

const RUN = '00000000-0000-4000-8000-000000000001';
const AT = '2026-11-14T10:00:00.000Z';

let scratch: string;
let layout: HubLayout;

function release(
  phase: HubUpdateRelease['phase'],
  change: Partial<HubUpdateRelease> = {},
): HubUpdateRelease {
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
    ...change,
  };
}

async function ledgerHolds(entry: HubUpdateRelease): Promise<StepDependencies> {
  await mkdir(layout.system.updates.selfUpdate, { recursive: true });
  await writeFile(
    join(layout.system.updates.selfUpdate, HUB_UPDATE_LEDGER_FILE),
    JSON.stringify({ releases: [entry] }),
  );
  return {
    layout,
    publicServer: () => 'https://home.example',
    finished: () => Promise.resolve(entry),
  };
}

const TIP = 'c'.repeat(40);

const REVISION: UpdateRevision = {
  id: '00000000-0000-4000-8000-0000000000aa',
  tip: TIP,
  pushedFrom: null,
  base: null,
  status: 'running',
  steps: [],
  notes: 'Notes',
  failure: null,
  receivedAt: AT,
  updatedAt: AT,
  finishedAt: null,
};

const step = {
  component: 'hub',
  status: 'running',
  runId: RUN,
  offered: false,
  detail: null,
} as const;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'pipeline-steps-'));
  layout = await testLayout(scratch);
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('Hub step', () => {
  it('waits for a Hub release that is already in the ledger and reports success', async () => {
    const deps = await ledgerHolds(release('done'));
    expect(await executeHub(deps, REVISION, step)).toEqual({ status: 'done', offered: false });
  });

  it('reports a restored release as failed with the reverted rollback and the reason', async () => {
    const deps = await ledgerHolds(
      release('reverted', { reason: 'The Hub did not answer its health check.' }),
    );
    const outcome = await executeHub(deps, REVISION, step);
    expect(outcome).toEqual({
      status: 'failed',
      message: `The Hub did not answer its health check. Hub update ${RUN} ended as reverted.`,
      rollback: 'reverted',
    });
  });

  it('reports an unverified recovery as unrecoverable and a pre-install failure as no rollback', async () => {
    const lost = await executeHub(await ledgerHolds(release('unrecoverable')), REVISION, step);
    expect(lost).toMatchObject({ status: 'failed', rollback: 'unrecoverable' });
    const early = await executeHub(
      await ledgerHolds(
        release('failed', { failedChecks: [{ name: 'build', ok: false, detail: 'tsc failed' }] }),
      ),
      REVISION,
      step,
    );
    expect(early).toMatchObject({ status: 'failed', rollback: 'none' });
    expect(JSON.stringify(early)).toContain('build: tsc failed');
  });

  it('refuses to run without a request ID', async () => {
    const deps = await ledgerHolds(release('done'));
    await expect(executeHub(deps, REVISION, { ...step, runId: null })).rejects.toThrow(
      'request ID',
    );
  });
});

describe('planned revision', () => {
  it('builds every publication step from the planned commit', async () => {
    const deps = await ledgerHolds(release('done'));
    for (const component of ['app', 'ui', 'desktop'] as const) {
      const planned = await publicationInput(deps, REVISION, { ...step, component });
      expect(planned.input).toMatchObject({ action: component, commit: TIP });
    }
  });

  it('refuses a Hub update when the remote moved past the planned revision', () => {
    expect(movedPastPlan(TIP, TIP)).toBeNull();
    expect(movedPastPlan('d'.repeat(40), TIP)).toMatchObject({
      status: 'failed',
      rollback: 'none',
    });
  });
});

describe('publication outcome', () => {
  const publication = {
    id: '00000000-0000-4000-8000-000000000009',
    clientId: null,
    applicationId: 'com.example.app',
    versionCode: '7',
    runtimeVersion: '1.0.0',
    desktop: null,
  };

  it('counts a published offer as done and offered', () => {
    expect(publishedOutcome({ status: 'published', runId: RUN, publication }, false)).toEqual({
      status: 'done',
      offered: true,
    });
  });

  it('turns refusals, failures and partial offers into plain failures', () => {
    expect(
      publishedOutcome({ status: 'failed', runId: RUN, reason: 'No signing key.' }, false),
    ).toEqual({
      status: 'failed',
      message: 'Publication failed: No signing key.',
      rollback: 'none',
    });
    const partial = publishedOutcome({ status: 'partial', runId: RUN, publication }, false);
    expect(partial).toMatchObject({ status: 'failed', rollback: 'none' });
    expect(JSON.stringify(partial)).toContain('partial');
    expect(() => publishedOutcome({ status: 'unknown' }, true)).toThrow();
  });
});

describe('lock contention', () => {
  it('retries an attempt that found another update running once the lock is free', async () => {
    let attempts = 0;
    let idles = 0;
    const result = await whenIdle(
      () => {
        idles += 1;
        return Promise.resolve();
      },
      () => {
        attempts += 1;
        return attempts < 3 ? Promise.reject(new UpdateBusyError('busy')) : Promise.resolve('ran');
      },
    );
    expect([result, attempts, idles]).toEqual(['ran', 3, 2]);
  });

  it('gives up with the busy error when the lock keeps being taken, and never retries other errors', async () => {
    let attempts = 0;
    await expect(
      whenIdle(
        () => Promise.resolve(),
        () => {
          attempts += 1;
          return Promise.reject(new UpdateBusyError('busy'));
        },
      ),
    ).rejects.toBeInstanceOf(UpdateBusyError);
    expect(attempts).toBe(3);
    let other = 0;
    await expect(
      whenIdle(
        () => Promise.resolve(),
        () => {
          other += 1;
          return Promise.reject(new Error('git failed'));
        },
      ),
    ).rejects.toThrow('git failed');
    expect(other).toBe(1);
  });

  it('waits on the real Hub release lock until the update holding it ends', async () => {
    let waited = false;
    let idle = Promise.resolve();
    await withHubReleaseLock(layout, false, async () => {
      idle = untilIdle(layout).then(() => {
        waited = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(waited).toBe(false);
    });
    await idle;
    expect(waited).toBe(true);
  });

  it('waits for a running build to release the executor lock', async () => {
    const lock = join(layout.system.updates.selfUpdate, 'executor.lock');
    await mkdir(layout.system.updates.selfUpdate, { recursive: true });
    const build = spawn('flock', [lock, 'sleep', '0.3'], { stdio: 'ignore' });
    const closed = once(build, 'close');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const started = Date.now();
    await untilIdle(layout);
    expect(Date.now() - started).toBeGreaterThan(100);
    await closed;
  });
});
