import { openSeededStore, testStore, type TestStore } from '../support/store';
import {
  API_ENDPOINTS,
  ApiError,
  type AppUpdateOutcome,
  type ClientRow,
} from '@smarteverything/domain';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AndroidBuilds } from '../../src/app-updates/android-builds';
import { bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { testStoreHost } from '../support/store-host';

const NOW = new Date('2026-11-05T10:00:00Z');
const LATER = new Date('2026-11-05T10:01:00Z');
let opened: TestStore;
let client: ClientRow;

function createClient(tokenHash: string): ClientRow {
  const profileId = opened.store.profiles.create({ name: 'Phone owner' }).id;
  return opened.store.clients.create({
    name: 'Phone',
    platform: 'android',
    role: 'member',
    tokenHash,
    profileId,
  });
}

beforeEach(async () => {
  opened = await testStore();
  client = createClient('a'.repeat(64));
});

afterEach(async () => {
  await opened.close();
});

const BUILD = {
  applicationId: 'com.devl0rd.smarteverything.dev',
  versionCode: '29897670',
  runtimeVersion: 'runtime-a',
  channel: 'release',
  currentUpdateId: null,
} as const;
const OUTCOME: AppUpdateOutcome = {
  updateId: '961c58b2-c7f7-4c66-9678-2cded842f05a',
  outcome: 'applied',
  reason: null,
};

describe('reported Android builds', () => {
  it('stores the last report time on every report and answers the same after a reopen', async () => {
    const builds = new AndroidBuilds(opened.store);
    expect(await builds.read(client)).toBeNull();
    await builds.report({ kind: 'client', client }, BUILD, NOW);
    await builds.report({ kind: 'client', client }, BUILD, LATER);
    const expected = { ...BUILD, observedAt: LATER.toISOString(), lastOutcome: null };
    expect(await builds.read(client)).toEqual(expected);
    expect(await builds.read({ ...client, id: OUTCOME.updateId ?? '' })).toBeNull();

    const reopened = await openSeededStore({
      host: testStoreHost(),
      path: join(opened.directory, 'test.db'),
      log: testLogger('app-updates'),
      now: () => LATER,
      systemTimeZone: 'UTC',
      driveFolders: null,
    });
    try {
      expect(await new AndroidBuilds(reopened).read(client)).toEqual(expected);
    } finally {
      await reopened.close();
    }
  });

  it('keeps a Test channel observation like any other', async () => {
    const builds = new AndroidBuilds(opened.store);
    await builds.report({ kind: 'client', client }, { ...BUILD, channel: 'dev' }, NOW);
    expect((await new AndroidBuilds(opened.store).read(client))?.channel).toBe('dev');
  });

  it('keeps the latest outcome across later build reports and replaces it by the next outcome', async () => {
    const builds = new AndroidBuilds(opened.store);
    await builds.report({ kind: 'client', client }, BUILD, NOW);
    await builds.recordOutcome(client, OUTCOME, NOW);
    await builds.report({ kind: 'client', client }, BUILD, LATER);
    expect((await builds.read(client))?.lastOutcome).toEqual({
      ...OUTCOME,
      recordedAt: NOW.toISOString(),
    });
    await builds.recordOutcome(
      client,
      { ...OUTCOME, outcome: 'rolled_back', reason: 'crashed' },
      LATER,
    );
    expect((await builds.read(client))?.lastOutcome).toMatchObject({
      outcome: 'rolled_back',
      reason: 'crashed',
      recordedAt: LATER.toISOString(),
    });
  });

  it('refuses an outcome before the app has reported its build', async () => {
    const builds = new AndroidBuilds(opened.store);
    await expect(builds.recordOutcome(client, OUTCOME, NOW)).rejects.toThrow(ApiError);
    expect(await builds.read(client)).toBeNull();
  });

  it('forgets observations when a profile or pairing credential changes or a client is revoked', async () => {
    const builds = new AndroidBuilds(opened.store);
    const { clients } = opened.store;
    await builds.report({ kind: 'client', client }, BUILD, NOW);
    const otherProfileId = opened.store.profiles.create({ name: 'Other person' }).id;
    const reassigned = clients.useProfile(client.id, otherProfileId);
    expect(await builds.read(reassigned)).toBeNull();

    await builds.report({ kind: 'client', client: reassigned }, BUILD, NOW);
    clients.replaceToken(client.id, 'c'.repeat(64));
    expect(await builds.read(reassigned)).toBeNull();

    await builds.report({ kind: 'client', client: reassigned }, BUILD, NOW);
    clients.remove(client.id);
    expect(opened.store.androidBuildObservations.read(client.id)).toBeNull();
  });

  it('does not accept a proxy or a non-Android client as a build reporter', async () => {
    const builds = new AndroidBuilds(opened.store);
    await expect(
      builds.report({ kind: 'client', client, via: 'assistant' }, BUILD, NOW),
    ).rejects.toThrow(ApiError);
    await expect(
      builds.report(
        { kind: 'client', client: { ...client, platform: 'web', kind: 'browser' } },
        BUILD,
        NOW,
      ),
    ).rejects.toThrow(ApiError);
    expect(await builds.read(client)).toBeNull();
  });

  it('answers the single and the list owner reads identically and refuses members', async () => {
    const builds = new AndroidBuilds(opened.store);
    const other = createClient('b'.repeat(64));
    await builds.report({ kind: 'client', client }, BUILD, NOW);
    await builds.report({ kind: 'client', client: other }, BUILD, LATER);
    const log = testLogger('app-updates');
    const owner = { kind: 'client', client: { ...client, role: 'owner' } } as const;
    const single = bound(API_ENDPOINTS.readAndroidAppBuild, ({ params }) =>
      builds.read({ ...client, id: params.clientId }),
    );
    const list = bound(API_ENDPOINTS.readAndroidAppBuilds, async () => [
      ...(await builds.paired([client, other])),
    ]);
    const input = { params: {}, query: {}, body: undefined, remote: '', headers: {} };
    await expect(list.run({ kind: 'client', client }, input, log)).rejects.toMatchObject({
      code: 'forbidden',
    });
    const listed = await builds.paired([client, other]);
    await expect(list.run(owner, input, log)).resolves.toEqual(listed);
    for (const entry of listed) {
      await expect(
        single.run(owner, { ...input, params: { clientId: entry.clientId } }, log),
      ).resolves.toEqual(entry.observation);
    }
    expect(listed).toHaveLength(2);
  });
});
