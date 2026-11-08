import { expect, it, vi } from 'vitest';
import type { ClientRow, HubUpdateSourceCheck } from '@smarteverything/domain';
import { hubUpdateSourceRoutes } from '../../src/server/handlers/hub-update-source';
import { testLogger } from '../support/logs';
import { testStore } from '../support/store';

const log = testLogger('hub-update-source');
const check: HubUpdateSourceCheck = {
  head: 'a'.repeat(40),
  relation: 'remote_ahead',
  tip: 'b'.repeat(40),
  remote: 'origin',
  branch: 'main',
  pending: { staged: 1, unstaged: 0, untracked: 0, conflicts: 0 },
};

it('checks only for the owner and takes no source settings from the request', async () => {
  const opened = await testStore();
  try {
    const { store } = opened;
    const owner = store.clients.create(
      { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
      true,
    );
    const member = store.clients.create(
      { name: 'Member', platform: 'android', role: 'member', tokenHash: 'b'.repeat(64) },
      false,
    );
    const inspect = vi.fn().mockResolvedValue(check);
    const route = hubUpdateSourceRoutes(
      {
        check: inspect,
        start: vi.fn(),
        save: vi.fn(),
      },
      () => undefined,
    ).routes.checkHubUpdateSource;
    const run = (client: ClientRow, query: unknown): Promise<unknown> =>
      route.run(
        { kind: 'client', client },
        { params: {}, query, body: undefined, remote: 'test', headers: {} },
        log,
      );
    await expect(run(member, {})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(owner, { remote: 'other' })).rejects.toMatchObject({
      code: 'invalid_request',
    });
    expect(inspect).not.toHaveBeenCalled();
    await expect(run(owner, {})).resolves.toEqual(check);
    expect(inspect).toHaveBeenCalledOnce();
    await expect(Promise.all([run(owner, {}), run(owner, {})])).resolves.toEqual([check, check]);
    expect(inspect).toHaveBeenCalledTimes(2);
    inspect.mockRejectedValueOnce(new Error('Fixture Git timeout'));
    await expect(run(owner, {})).rejects.toThrow('Fixture Git timeout');
    await expect(run(owner, {})).resolves.toEqual(check);
    expect(inspect).toHaveBeenCalledTimes(4);
  } finally {
    await opened.close();
  }
});

it('lets a source notice wait out an old coalesced owner check before the app refreshes', async () => {
  const opened = await testStore();
  try {
    const owner = opened.store.clients.create(
      { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
      true,
    );
    let finishFirst = (_result: HubUpdateSourceCheck): void => undefined;
    const first = new Promise<HubUpdateSourceCheck>((resolve) => {
      finishFirst = resolve;
    });
    const latest = { ...check, tip: 'c'.repeat(40) };
    const inspect = vi
      .fn<() => Promise<HubUpdateSourceCheck>>()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(latest);
    const source = hubUpdateSourceRoutes(
      { check: inspect, start: vi.fn(), save: vi.fn() },
      () => undefined,
    );
    const caller = { kind: 'client', client: owner } as const;
    const raw = { params: {}, query: {}, body: undefined, remote: 'test', headers: {} };
    const run = (): Promise<unknown> => source.routes.checkHubUpdateSource.run(caller, raw, log);
    const old = run();
    const joined = run();
    const refresh = source.settleChecks().then(run);
    await Promise.resolve();
    expect(inspect).toHaveBeenCalledOnce();
    finishFirst(check);
    await expect(Promise.all([old, joined, refresh])).resolves.toEqual([check, check, latest]);
    expect(inspect).toHaveBeenCalledTimes(2);
  } finally {
    await opened.close();
  }
});

it('only starts the reviewed release for a direct authenticated owner app', async () => {
  const opened = await testStore();
  try {
    const { store } = opened;
    const owner = store.clients.create(
      { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
      true,
    );
    const request = {
      offerId: 'b74c6d67-142c-471c-96bd-cb5ee27defbf',
      requestId: 'e8c95ddd-5e3f-4dc8-8f06-ce1fb5a755d9',
      includePending: true,
    };
    const start = vi.fn().mockResolvedValue({ status: 'started', runId: request.requestId });
    const route = hubUpdateSourceRoutes(
      {
        check: vi.fn(),
        start,
        save: vi.fn(),
      },
      () => undefined,
    ).routes.startHubUpdateSource;
    const raw = { params: {}, query: {}, body: request, remote: 'test', headers: {} };
    await expect(
      route.run({ kind: 'client', client: owner, mcpOrigin: 'personal' }, raw, log),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      route.run(
        { kind: 'client', client: owner },
        { ...raw, body: { ...request, branch: 'other' } },
        log,
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(start).not.toHaveBeenCalled();
    await expect(route.run({ kind: 'client', client: owner }, raw, log)).resolves.toEqual({
      status: 'started',
      runId: request.requestId,
    });
    expect(start).toHaveBeenCalledExactlyOnceWith(owner.id, request);
  } finally {
    await opened.close();
  }
});

it('only saves a named recovery branch for a direct authenticated owner app', async () => {
  const opened = await testStore();
  try {
    const owner = opened.store.clients.create(
      { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
      true,
    );
    const request = {
      offerId: 'b74c6d67-142c-471c-96bd-cb5ee27defbf',
      requestId: 'e8c95ddd-5e3f-4dc8-8f06-ce1fb5a755d9',
      branch: 'backup/owner-work',
    };
    const result = { branch: request.branch, commit: 'a'.repeat(40) };
    const save = vi.fn().mockResolvedValue(result);
    const start = vi.fn();
    const route = hubUpdateSourceRoutes(
      { check: vi.fn(), start, save },
      () => undefined,
    ).routes.saveHubUpdateSource;
    const raw = { params: {}, query: {}, body: request, remote: 'test', headers: {} };
    await expect(
      route.run({ kind: 'client', client: owner, mcpOrigin: 'personal' }, raw, log),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(save).not.toHaveBeenCalled();
    await expect(route.run({ kind: 'client', client: owner }, raw, log)).resolves.toEqual(result);
    expect(save).toHaveBeenCalledExactlyOnceWith(owner.id, request);
    expect(start).not.toHaveBeenCalled();
  } finally {
    await opened.close();
  }
});
