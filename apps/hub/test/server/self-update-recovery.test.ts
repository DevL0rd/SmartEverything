import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  HUB_UPDATE_LEDGER_FILE,
  hubUpdateOutcome,
  type ClientRow,
  type HubUpdateRelease,
  type HubUpdateRecoveryResult,
} from '@smarteverything/domain';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { hubUpdateStatus, readHubUpdate } from '../../src/self-update/recovery';
import { selfUpdateRecoveryRoutes } from '../../src/server/handlers/self-update-recovery';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const RUN = '00000000-0000-4000-8000-000000000001';
const PREVIOUS = '00000000-0000-4000-8000-000000000002';
const NOW = '2026-11-05T06:00:00.000Z';
const LATER = '2026-11-05T06:05:00.000Z';
const SECRET = '/home/private/release';
const log = testLogger('self-update-recovery');

let opened: TestStore;
let owner: ClientRow;
let member: ClientRow;
let routes: ReturnType<typeof selfUpdateRecoveryRoutes>;

const calls: (readonly [string, number])[] = [];
const rollbacks: string[] = [];
const keeps: string[] = [];

beforeAll(async () => {
  opened = await testStore();
  const { store } = opened;
  owner = store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  member = store.clients.create(
    { name: 'Member', platform: 'android', role: 'member', tokenHash: 'b'.repeat(64) },
    false,
  );
  routes = selfUpdateRecoveryRoutes({
    status: () => hubUpdateStatus(opened.layout),
    recover: (id, seconds): Promise<HubUpdateRecoveryResult> => {
      calls.push([id, seconds]);
      return Promise.resolve({ status: 'started', runId: id });
    },
    rollback: (id): Promise<HubUpdateRecoveryResult> => {
      rollbacks.push(id);
      return Promise.resolve({ status: 'started', runId: id });
    },
    keep: (id): Promise<HubUpdateRecoveryResult> => {
      keeps.push(id);
      return Promise.resolve({ status: 'started', runId: id });
    },
  });
});

afterAll(async () => {
  await opened.close();
});

function call(route: Bound, client: ClientRow, body?: unknown): Promise<unknown> {
  return route.run(
    { kind: 'client', client },
    { params: {}, query: {}, body, remote: 'test', headers: {} },
    log,
  );
}

function release(runId: string, updatedAt: string): HubUpdateRelease {
  return {
    runId,
    phase: 'verifying',
    notes: 'The local release',
    build: SECRET,
    backup: SECRET,
    url: 'http://127.0.0.1:7880',
    healthFile: SECRET,
    watchdogUnit: SECRET,
    startingSchema: 164,
    changedDatabase: false,
    installs: [SECRET],
    checks: [{ name: 'startup', ok: false, detail: SECRET }],
    failedChecks: [],
    reason: SECRET,
    interrupted: true,
    revision: 2,
    startedAt: NOW,
    updatedAt,
    finishedAt: null,
  };
}

it('reports that no release is recorded when the hub has never updated', async () => {
  await expect(call(routes.readHubUpdateRecovery, owner)).resolves.toEqual({ release: null });
});

it('reports the latest release without disclosing local paths or diagnostics', async () => {
  const directory = opened.layout.system.updates.selfUpdate;
  await mkdir(directory);
  await writeFile(
    join(directory, HUB_UPDATE_LEDGER_FILE),
    JSON.stringify({ releases: [release(PREVIOUS, NOW), release(RUN, LATER)] }),
  );
  await expect(call(routes.readHubUpdateRecovery, owner)).resolves.toEqual({
    release: {
      runId: RUN,
      phase: 'verifying',
      interrupted: true,
      startedAt: NOW,
      updatedAt: LATER,
      finishedAt: null,
      reason: null,
      failedChecks: [],
      backupKept: false,
    },
  });
});

it('reports the reason, failed checks and kept backup of a release waiting for a decision', async () => {
  const failed = { name: 'startup', ok: false, detail: 'the hub did not answer' };
  await writeFile(
    join(opened.layout.system.updates.selfUpdate, HUB_UPDATE_LEDGER_FILE),
    JSON.stringify({
      releases: [
        {
          ...release(RUN, LATER),
          phase: 'awaiting_decision',
          interrupted: false,
          reason: 'the new release did not start',
          failedChecks: [failed],
        },
      ],
    }),
  );
  await expect(call(routes.readHubUpdateRecovery, owner)).resolves.toMatchObject({
    release: {
      phase: 'awaiting_decision',
      reason: 'the new release did not start',
      failedChecks: [failed],
      backupKept: true,
    },
  });
});

it('recovers a specified release outcome from disk after another release starts', async () => {
  const previous = {
    ...release(PREVIOUS, NOW),
    phase: 'failed' as const,
    finishedAt: NOW,
  };
  await writeFile(
    join(opened.layout.system.updates.selfUpdate, HUB_UPDATE_LEDGER_FILE),
    JSON.stringify({ releases: [previous, release(RUN, LATER)] }),
  );
  const found = await readHubUpdate(opened.layout, PREVIOUS);
  expect(found).toEqual(previous);
  expect(found === null ? null : hubUpdateOutcome(found)).toBe('failed');
  await expect(readHubUpdate(opened.layout, RUN)).resolves.toMatchObject({
    phase: 'verifying',
  });
});

it('refuses member reads and recovery requests before handing work to the watchdog', async () => {
  await expect(call(routes.readHubUpdateRecovery, member)).rejects.toMatchObject({
    code: 'forbidden',
  });
  await expect(call(routes.recoverHubUpdate, member, { runId: RUN })).rejects.toMatchObject({
    code: 'forbidden',
  });
  expect(calls).toEqual([]);
});

it('accepts only a release id and hold time, never caller-supplied paths', async () => {
  await expect(
    call(routes.recoverHubUpdate, owner, { runId: RUN, backup: SECRET }),
  ).rejects.toMatchObject({ code: 'invalid_request' });
  await expect(call(routes.recoverHubUpdate, owner, { runId: SECRET })).rejects.toMatchObject({
    code: 'invalid_request',
  });
  expect(calls).toEqual([]);
  await expect(call(routes.recoverHubUpdate, owner, { runId: RUN })).resolves.toEqual({
    status: 'started',
    runId: RUN,
  });
  expect(calls).toEqual([[RUN, 120]]);
});

it('rolls back only on an owner request that names the release and nothing else', async () => {
  await expect(call(routes.rollbackHubUpdate, member, { runId: RUN })).rejects.toMatchObject({
    code: 'forbidden',
  });
  await expect(
    call(routes.rollbackHubUpdate, owner, { runId: RUN, backup: SECRET }),
  ).rejects.toMatchObject({ code: 'invalid_request' });
  expect(rollbacks).toEqual([]);
  await expect(call(routes.rollbackHubUpdate, owner, { runId: RUN })).resolves.toEqual({
    status: 'started',
    runId: RUN,
  });
  expect(rollbacks).toEqual([RUN]);
});

it('keeps a release only on an owner request that names the release and nothing else', async () => {
  await expect(call(routes.keepHubUpdate, member, { runId: RUN })).rejects.toMatchObject({
    code: 'forbidden',
  });
  await expect(
    call(routes.keepHubUpdate, owner, { runId: RUN, backup: SECRET }),
  ).rejects.toMatchObject({ code: 'invalid_request' });
  expect(keeps).toEqual([]);
  await expect(call(routes.keepHubUpdate, owner, { runId: RUN })).resolves.toEqual({
    status: 'started',
    runId: RUN,
  });
  expect(keeps).toEqual([RUN]);
});
