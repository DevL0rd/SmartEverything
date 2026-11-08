import {
  CLIENT_PREFS,
  RUNTIME_LOG_AROUND,
  RUNTIME_LOG_GAPS,
  RUNTIME_LOG_PAGE,
  type ClientRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '../../src/server/auth';
import { partCallOf, toolNamed } from '../../src/extensions/mcp/tools';
import { clientRoutes } from '../../src/server/handlers/client-settings';
import { runtimeLogRoutes } from '../../src/server/handlers/runtime-logs';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-11-05T06:00:00.000Z';
const END = '2026-11-05T06:10:00.000Z';
const RECORD = {
  timestamp: NOW,
  level: 'info',
  runtime: 'app',
  platform: 'android',
  scope: 'app.test',
  event: 'test.started',
  payload: {},
};

let opened: TestStore;
let owner: ClientRow;
let member: ClientRow;
let routes: ReturnType<typeof runtimeLogRoutes>;

beforeEach(async () => {
  opened = await testStore(() => new Date(END));
  owner = opened.store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  member = opened.store.clients.create(
    { name: 'Member', platform: 'android', role: 'member', tokenHash: 'b'.repeat(64) },
    false,
  );
  routes = runtimeLogRoutes({ store: opened.store }, () => new Date(END));
});

afterEach(async () => {
  await opened.close();
});

function profileOf(client: ClientRow): string {
  return client.role === 'owner'
    ? '00000000-0000-4000-8000-000000000101'
    : '00000000-0000-4000-8000-000000000102';
}

function paired(client: ClientRow): Caller {
  return { kind: 'client', client, profileId: profileOf(client) };
}

function expectedSource(client: ClientRow): {
  readonly clientId: string;
  readonly profileId: string;
} {
  return { clientId: client.id, profileId: profileOf(client) };
}

function run(
  route: Bound,
  caller: Caller,
  query: Readonly<Record<string, unknown>>,
  body?: unknown,
): Promise<unknown> {
  return route.run(caller, { params: {}, query, body, remote: 'test', headers: {} }, testLogger());
}

describe('runtime log routes', () => {
  it('stores desktop process logs under the paired owner desktop, not a selected profile', async () => {
    const batch = { records: [RECORD] };
    await expect(
      run(routes.ingestDesktopRuntimeLogs, paired(owner), {}, batch),
    ).resolves.toMatchObject({
      accepted: 1,
    });
    await expect(
      run(routes.ingestDesktopRuntimeLogs, paired(member), {}, batch),
    ).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      run(
        routes.ingestDesktopRuntimeLogs,
        { kind: 'client', client: owner, via: 'assistant' },
        {},
        batch,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const mine = RUNTIME_LOG_PAGE.parse(await run(routes.searchRuntimeLogs, paired(member), {}));
    const all = RUNTIME_LOG_PAGE.parse(await run(routes.searchRuntimeLogs, paired(owner), {}));
    expect(mine.rows).toEqual([]);
    expect(all.rows).toMatchObject([
      { runtime: 'desktop', platform: 'server', source: `desktop:${owner.id}`, deviceId: owner.id },
    ]);
  });

  it('lets only a paired owner change developer preferences, without restricting other layouts', async () => {
    const { saveLayout } = clientRoutes(opened.store, {
      registerHardware: () => Promise.resolve(),
    });
    const preference = CLIENT_PREFS.developer_level;
    const write = (caller: Caller, page: string): Promise<unknown> =>
      saveLayout.run(
        caller,
        {
          params: { page },
          query: {},
          body: { layout: preference.encode('on') },
          remote: 'test',
          headers: {},
        },
        testLogger(),
      );
    await expect(write(paired(owner), preference.storageKey)).resolves.toMatchObject({
      page: preference.storageKey,
    });
    await expect(write(paired(member), preference.storageKey)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      write({ kind: 'client', client: owner, via: 'assistant' }, preference.storageKey),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const unrelated = CLIENT_PREFS.navigation_device.storageKey;
    await expect(write(paired(member), unrelated)).resolves.toMatchObject({
      page: unrelated,
    });
  });

  it('exposes the same stored log reads through one read-only MCP tool', () => {
    expect(toolNamed('log_read')?.listing.annotations.readOnlyHint).toBe(true);
    expect(partCallOf('log_read', { text: 'connected' })).toEqual({
      name: 'search_runtime_logs',
      args: { text: 'connected' },
    });
    expect(partCallOf('log_read', { view: 'around', id: 1 })).toEqual({
      name: 'read_runtime_logs_around',
      args: { id: 1 },
    });
    expect(partCallOf('log_read', { view: 'sources' })).toEqual({
      name: 'read_runtime_log_sources',
      args: {},
    });
  });

  it('attributes log batches and gaps to the authenticated profile, and lets only the owner see both profiles', async () => {
    await run(
      routes.ingestRuntimeLogs,
      paired(owner),
      {},
      { ...expectedSource(owner), records: [RECORD] },
    );
    await run(
      routes.ingestRuntimeLogs,
      paired(member),
      {},
      { ...expectedSource(member), records: [RECORD] },
    );
    await run(
      routes.reportRuntimeLogGap,
      paired(member),
      {},
      { firstSentAt: NOW, lastSentAt: END },
    );

    const visible = RUNTIME_LOG_PAGE.parse(await run(routes.searchRuntimeLogs, paired(member), {}));
    const all = RUNTIME_LOG_PAGE.parse(await run(routes.searchRuntimeLogs, paired(owner), {}));
    const gaps = RUNTIME_LOG_GAPS.parse(await run(routes.readRuntimeLogGaps, paired(member), {}));
    expect(visible.rows.map((entry) => entry.deviceId)).toEqual([member.id]);
    expect(all.rows.map((entry) => entry.deviceId)).toEqual([member.id, owner.id]);
    expect(gaps.gaps).toHaveLength(1);
  });

  it('does not accept a claimed device or assistant-originated write', async () => {
    await expect(
      run(
        routes.ingestRuntimeLogs,
        paired(member),
        {},
        {
          ...expectedSource(owner),
          records: [RECORD],
        },
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      run(
        routes.ingestRuntimeLogs,
        paired(owner),
        {},
        {
          ...expectedSource(owner),
          profileId: profileOf(member),
          records: [RECORD],
        },
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(
      run(
        routes.reportRuntimeLogGap,
        { kind: 'client', client: owner, via: 'assistant' },
        {},
        {
          firstSentAt: NOW,
          lastSentAt: END,
        },
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('pages past identical timestamps without skipping records', async () => {
    const caller = paired(owner);
    await run(
      routes.ingestRuntimeLogs,
      caller,
      {},
      {
        ...expectedSource(owner),
        records: [RECORD, { ...RECORD, event: 'test.finished' }],
      },
    );
    const first = RUNTIME_LOG_PAGE.parse(await run(routes.searchRuntimeLogs, caller, { limit: 1 }));
    const row = first.rows[0];
    if (row === undefined) throw new Error('Expected the first log');
    const second = RUNTIME_LOG_PAGE.parse(
      await run(routes.searchRuntimeLogs, caller, { limit: 1, to: row.at, toId: row.id }),
    );
    expect(first.more).toBe(true);
    expect(second.rows.map((entry) => entry.event)).toEqual(['test.started']);
    expect(second.more).toBe(false);
  });

  it('reads around the nearest visible record by time, preferring the earlier record on ties', async () => {
    const caller = paired(member);
    await run(
      routes.ingestRuntimeLogs,
      caller,
      {},
      {
        ...expectedSource(member),
        records: [
          { ...RECORD, timestamp: END, event: 'test.newest' },
          RECORD,
          { ...RECORD, timestamp: '2026-11-05T06:04:00.000Z', event: 'test.late_arrival' },
        ],
      },
    );
    await run(
      routes.ingestRuntimeLogs,
      paired(owner),
      {},
      {
        ...expectedSource(owner),
        records: [{ ...RECORD, timestamp: '2026-11-05T06:07:00.000Z' }],
      },
    );
    const tied = RUNTIME_LOG_AROUND.parse(
      await run(routes.readRuntimeLogsAround, caller, { at: '2026-11-05T13:07:00+07:00' }),
    );
    expect(tied.anchor.event).toBe('test.late_arrival');
    expect(tied.before.map((entry) => entry.event)).toEqual(['test.started']);
    expect(tied.after.map((entry) => entry.event)).toEqual(['test.newest']);

    const nearerFuture = RUNTIME_LOG_AROUND.parse(
      await run(routes.readRuntimeLogsAround, caller, { at: '2026-11-05T06:09:00.000Z' }),
    );
    expect(nearerFuture.anchor.event).toBe('test.newest');
    await expect(run(routes.readRuntimeLogsAround, caller, {})).rejects.toThrow();
  });
});
