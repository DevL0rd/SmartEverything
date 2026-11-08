import { join } from 'node:path';
import {
  API_ENDPOINTS as E,
  GOOGLE_ACCOUNT_ROW,
  GOOGLE_SYNC_LOG_ENTRY,
  type GoogleSyncLogEntry,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SimulatedClock } from '../../src/clock/simulated';
import { channelToken } from '../../src/google/channels';
import type { Caller } from '../../src/server/auth';
import { googleRoutes, receivePush } from '../../src/server/handlers/google';
import { plannerItemRoutes } from '../../src/server/handlers/planner-items';
import type { Bound } from '../../src/server/router';
import { SecretStore } from '../../src/secrets/store';
import { startGoogle, type GoogleHub } from '../../src/services';
import {
  createFakeGoogle,
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  type FakeGoogle,
} from '../fakes/google';
import { captureLogs, testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const EMAIL = 'ann@example.test';
const REDIRECT = 'http://127.0.0.1:53682/callback';
const PUBLIC_URL = 'https://hub.example.test';
const START = '2026-11-08T00:00:00.000Z';
const KEY = Buffer.alloc(32, 9);
const TITLE = 'Call the bank';

interface Rig {
  readonly google: FakeGoogle;
  readonly test: TestStore;
  readonly hub: GoogleHub;
  readonly routes: ReturnType<typeof googleRoutes>;
  readonly planner: ReturnType<typeof plannerItemRoutes>;
  readonly owner: TestPerson;
  readonly ann: TestPerson;
  readonly bob: TestPerson;
  readonly network: { insertsDown: boolean };
}

let rig: Rig;

const as = (person: TestPerson): Caller => ({ kind: 'client', client: person.client });

const call = (
  route: Bound,
  person: TestPerson,
  raw: { params?: unknown; query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    as(person),
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

async function build(): Promise<Rig> {
  captureLogs();
  const google = createFakeGoogle();
  const test = await testStore(() => google.clock.now());
  const secrets = await SecretStore.open(join(test.directory, 'secrets'), Buffer.alloc(32, 7));
  const network = { insertsDown: false };
  const hub = startGoogle({
    store: test.store,
    secrets,
    fetch: (input, init) =>
      network.insertsDown && init.method === 'POST' && new URL(input).pathname.endsWith('/tasks')
        ? Promise.reject(new TypeError('network down'))
        : google.fetch(input, init),
    clock: new SimulatedClock(START),
    key: KEY,
  });
  return {
    google,
    test,
    hub,
    routes: googleRoutes({ store: test.store, secrets }, hub),
    planner: plannerItemRoutes({ store: test.store }, () => google.clock.now()),
    owner: addPerson(test, 'Owner', 'owner'),
    ann: addPerson(test, 'Ann', 'member'),
    bob: addPerson(test, 'Bob', 'member'),
    network,
  };
}

async function storeApp(): Promise<void> {
  await call(rig.routes.googleApp, rig.owner, {
    body: {
      androidClientId: 'android-client',
      desktopClientId: FAKE_CLIENT_ID,
      desktopClientSecret: FAKE_CLIENT_SECRET,
    },
  });
}

async function startLink(person: TestPerson): Promise<z.output<typeof E.googleLinkStart.response>> {
  return E.googleLinkStart.response.parse(
    await call(rig.routes.googleLinkStart, person, {
      body: {
        platform: 'desktop',
        redirectUri: REDIRECT,
        products: [
          { product: 'calendar', readOnly: false },
          { product: 'tasks', readOnly: false },
        ],
      },
    }),
  );
}

async function linkAnn(): Promise<void> {
  await storeApp();
  const started = await startLink(rig.ann);
  const consent = rig.google.oauth.consent(started.authUrl, EMAIL);
  await call(rig.routes.googleLinkFinish, rig.ann, {
    body: { code: consent.code, state: started.state, redirectUri: REDIRECT },
  });
  await rig.hub.runner.sync(rig.ann.profileId, 'manual');
}

function thrownBy(work: () => void): unknown {
  try {
    work();
  } catch (cause) {
    return cause;
  }
  return null;
}

async function readLog(person: TestPerson, query: object = {}): Promise<GoogleSyncLogEntry[]> {
  return z
    .array(GOOGLE_SYNC_LOG_ENTRY)
    .parse(await call(rig.routes.googleSyncLog, person, { query }));
}

beforeEach(async () => {
  rig = await build();
});

afterEach(async () => {
  rig.hub.stop();
  await rig.test.close();
});

describe('linking', () => {
  it('starts a link with the consent address and the state', async () => {
    await storeApp();
    const started = await startLink(rig.ann);
    const url = new URL(started.authUrl);
    expect(url.searchParams.get('state')).toBe(started.state);
    expect(url.searchParams.get('client_id')).toBe(FAKE_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(rig.test.store.googleAccounts.byProfile(rig.ann.profileId).status).toBe('linking');
  });

  it('refuses to start before the client ids are stored', async () => {
    await expect(startLink(rig.ann)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects a finish with the wrong state and keeps the link open', async () => {
    await storeApp();
    const started = await startLink(rig.ann);
    const consent = rig.google.oauth.consent(started.authUrl, EMAIL);
    await expect(
      call(rig.routes.googleLinkFinish, rig.ann, {
        body: { code: consent.code, state: 'forged', redirectUri: REDIRECT },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(rig.test.store.googleAccounts.byProfile(rig.ann.profileId).email).toBeNull();
    const finished = GOOGLE_ACCOUNT_ROW.parse(
      await call(rig.routes.googleLinkFinish, rig.ann, {
        body: { code: consent.code, state: started.state, redirectUri: REDIRECT },
      }),
    );
    expect(finished).toMatchObject({ email: EMAIL, status: 'linked' });
    await rig.hub.runner.sync(rig.ann.profileId, 'manual');
  });

  it('does not let another person finish a link they did not start', async () => {
    await storeApp();
    const started = await startLink(rig.ann);
    const consent = rig.google.oauth.consent(started.authUrl, EMAIL);
    await expect(
      call(rig.routes.googleLinkFinish, rig.bob, {
        body: { code: consent.code, state: started.state, redirectUri: REDIRECT },
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('unlinks and forgets the stored tokens', async () => {
    await linkAnn();
    await call(rig.routes.googleUnlink, rig.ann);
    expect(rig.test.store.googleAccounts.byProfile(rig.ann.profileId)).toMatchObject({
      status: 'unlinked',
      email: null,
    });
    await expect(call(rig.routes.googleSync, rig.ann)).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('keeps the client ids owner-only', async () => {
    await expect(
      call(rig.routes.googleApp, rig.ann, {
        body: { androidClientId: 'a', desktopClientId: 'd', desktopClientSecret: 's' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('syncing', () => {
  it('chooses what syncs, then syncs both products and logs the runs newest first', async () => {
    await linkAnn();
    const chosen = GOOGLE_ACCOUNT_ROW.parse(
      await call(rig.routes.googleAccount, rig.ann, { body: { calendar_ids: [EMAIL] } }),
    );
    expect(chosen.calendar_ids).toEqual([EMAIL]);
    await call(rig.routes.googleSync, rig.ann);
    const log = await readLog(rig.ann);
    const manual = log.filter((entry) => entry.trigger === 'manual');
    expect(manual.map((entry) => entry.product).sort()).toEqual(['calendar', 'tasks']);
    expect(manual.every((entry) => entry.error === null)).toBe(true);
    const times = log.map((entry) => Date.parse(entry.at));
    expect(times).toEqual([...times].sort((first, second) => second - first));
  });

  it('answers only the entries older than the asked moment', async () => {
    await linkAnn();
    const everything = await readLog(rig.ann, { before: '2100-01-01T00:00:00.000Z' });
    expect(everything.length).toBeGreaterThan(0);
    const [newest] = everything;
    if (newest === undefined) throw new Error('missing');
    const older = await readLog(rig.ann, { before: newest.at });
    expect(older.every((entry) => Date.parse(entry.at) < Date.parse(newest.at))).toBe(true);
    expect(older.map((entry) => entry.id)).not.toContain(newest.id);
  });
});

async function uncertainChoice(): Promise<{
  readonly entry: GoogleSyncLogEntry;
  readonly itemId: string;
  readonly second: string;
}> {
  await linkAnn();
  const list = rig.test.store.plannerCollections
    .list(rig.ann.profileId)
    .find((collection) => collection.kind === 'list' && collection.source === 'google');
  if (list === undefined) throw new Error('the Google list was not mirrored');
  rig.network.insertsDown = true;
  const created = await call(rig.planner.createPlannerItem, rig.ann, {
    body: { collection_id: list.id, kind: 'task', title: TITLE },
  });
  const itemId = z.object({ id: z.string() }).parse(created).id;
  await rig.hub.runner.sync(rig.ann.profileId, 'manual');
  rig.network.insertsDown = false;
  const remote = rig.google.account(EMAIL).tasks.all()[0];
  if (remote === undefined) throw new Error('the fake has no task list');
  remote.insert({ title: TITLE }, { parent: null, previous: null });
  const second = remote.insert({ title: TITLE }, { parent: null, previous: null });
  await rig.hub.runner.sync(rig.ann.profileId, 'manual');
  await rig.hub.runner.sync(rig.ann.profileId, 'manual');
  const entry = (await readLog(rig.ann)).find((candidate) => candidate.choice !== null);
  if (entry === undefined) throw new Error('no choice entry was written');
  return { entry, itemId, second: z.object({ id: z.string() }).parse(second).id };
}

describe('choosing between matching Google tasks', () => {
  it('adopts the picked task and marks the entry resolved', async () => {
    const { entry, itemId, second } = await uncertainChoice();
    expect(entry.choice?.candidates).toHaveLength(2);
    const resolved = GOOGLE_SYNC_LOG_ENTRY.parse(
      await call(rig.routes.googleChoice, rig.ann, {
        body: { logId: entry.id, googleId: second },
      }),
    );
    expect(resolved.choice?.resolved_google_id).toBe(second);
    expect(rig.test.store.plannerItems.byId(itemId, rig.ann.profileId).google).toMatchObject({
      id: second,
      state: 'synced',
    });
  });

  it('refuses a task that is not one of the matches and a choice made twice', async () => {
    const { entry, second } = await uncertainChoice();
    await expect(
      call(rig.routes.googleChoice, rig.ann, { body: { logId: entry.id, googleId: 'other' } }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await call(rig.routes.googleChoice, rig.ann, { body: { logId: entry.id, googleId: second } });
    await expect(
      call(rig.routes.googleChoice, rig.ann, { body: { logId: entry.id, googleId: second } }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('keeps another person from resolving the entry', async () => {
    const { entry, second } = await uncertainChoice();
    await expect(
      call(rig.routes.googleChoice, rig.bob, { body: { logId: entry.id, googleId: second } }),
    ).rejects.toThrow();
    expect(
      (await readLog(rig.ann)).find((candidate) => candidate.id === entry.id)?.choice
        ?.resolved_google_id,
    ).toBeNull();
  });
});

describe('member scope', () => {
  it('lets a member read only their own log and lets the owner read anyone', async () => {
    await linkAnn();
    await expect(
      call(rig.routes.googleSyncLog, rig.bob, { query: { personId: rig.ann.profileId } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(await readLog(rig.bob)).toEqual([]);
    expect((await readLog(rig.owner, { personId: rig.ann.profileId })).length).toBeGreaterThan(0);
  });

  it('keeps one person from syncing, unlinking or changing another person’s account', async () => {
    await linkAnn();
    const query = { personId: rig.ann.profileId };
    for (const route of [rig.routes.googleSync, rig.routes.googleUnlink]) {
      await expect(call(route, rig.bob, { query })).rejects.toMatchObject({ code: 'forbidden' });
    }
    await expect(
      call(rig.routes.googleAccount, rig.bob, { query, body: { list_ids: ['x'] } }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(rig.test.store.googleAccounts.byProfile(rig.ann.profileId).status).toBe('linked');
  });
});

describe('push receiver', () => {
  beforeEach(() => {
    rig.test.store.settings.setPublicUrl(PUBLIC_URL);
    rig.test.store.settings.recordPublicUrlCheck(PUBLIC_URL, { verified: true });
  });

  async function openChannel(): Promise<{
    readonly channelId: string;
    readonly resourceId: string;
  }> {
    await linkAnn();
    await call(rig.routes.googleAccount, rig.ann, { body: { calendar_ids: [EMAIL] } });
    await rig.hub.runner.sync(rig.ann.profileId, 'manual');
    await vi.waitFor(() => {
      expect(
        rig.test.store.googleSyncState
          .forProfile(rig.ann.profileId)
          .some((state) => state.channel !== null),
      ).toBe(true);
    });
    const channel = rig.test.store.googleSyncState
      .forProfile(rig.ann.profileId)
      .find((state) => state.channel !== null)?.channel;
    if (channel === null || channel === undefined) throw new Error('no channel');
    return { channelId: channel.channel_id, resourceId: channel.resource_id };
  }

  const headers = (
    token: string,
    resourceId: string,
    state = 'exists',
  ): Record<string, string> => ({
    'x-goog-channel-token': token,
    'x-goog-resource-id': resourceId,
    'x-goog-resource-state': state,
  });

  it('rejects a wrong token, a missing token and a wrong resource', async () => {
    const { channelId, resourceId } = await openChannel();
    const good = channelToken(KEY, channelId);
    for (const sent of [headers('wrong', resourceId), {}, headers(good, 'elsewhere')]) {
      expect(
        thrownBy(() => {
          receivePush(rig.hub.receiver, { channelId, headers: sent });
        }),
      ).toMatchObject({ code: 'forbidden' });
    }
    await expect(
      rig.routes.googlePush.run(
        { kind: 'anonymous' },
        { params: { channelId }, query: {}, body: undefined, remote: 'test', headers: {} },
        testLogger(),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('queues one incremental sync for a good notification and ignores a sync handshake', async () => {
    const { channelId, resourceId } = await openChannel();
    const good = channelToken(KEY, channelId);
    const pushes = (): number =>
      rig.test.store.googleSyncLog
        .list(rig.ann.profileId)
        .filter((entry) => entry.trigger === 'push' && entry.product === 'calendar').length;
    receivePush(rig.hub.receiver, {
      channelId,
      headers: headers(good, resourceId, 'sync'),
    });
    receivePush(rig.hub.receiver, { channelId, headers: headers(good, resourceId) });
    await vi.waitFor(() => {
      expect(pushes()).toBe(1);
    });
  });
});
