import { FakeMemoryEmbedder } from '../support/memory-embedder';
import { API_ENDPOINTS, ApiError } from '@smarteverything/domain';
import type { ClientRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryRoutes } from '../../src/memory/routes';
import { MemoryService } from '../../src/memory/service';
import type { Caller } from '../../src/server/auth';
import type { Bound } from '../../src/server/router';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let routes: ReturnType<typeof memoryRoutes>;
let owner: Caller;
let ida: Caller;
let kid: Caller;

function paired(name: string, role: ClientRow['role'], profileId?: string): Caller {
  const client = opened.store.clients.create({
    name,
    platform: 'android',
    role,
    tokenHash: name.padEnd(64, '0'),
    ...(profileId === undefined ? {} : { profileId }),
  });
  return { kind: 'client', client };
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  routes = memoryRoutes(
    opened.store,
    new MemoryService(opened.store.aiMemories, opened.store.aiChats, new FakeMemoryEmbedder()),
  );
  owner = paired('owner', 'owner');
  ida = paired('ida', 'member', opened.store.profiles.create({ name: 'Ida' }).id);
  kid = paired('kid', 'member', opened.store.profiles.create({ name: 'Kid' }).id);
});

afterEach(async () => {
  await opened.close();
});

function run(
  route: Bound,
  caller: Caller,
  raw: { readonly params?: unknown; readonly query?: unknown; readonly body?: unknown } = {},
): Promise<unknown> {
  return route.run(
    caller,
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );
}

async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (cause) {
    if (cause instanceof ApiError) return cause.code;
    throw cause;
  }
  return 'allowed';
}

async function listed(caller: Caller): Promise<readonly string[]> {
  return API_ENDPOINTS.listAiMemories.response
    .parse(await run(routes.listAiMemories, caller))
    .memories.map((entry) => entry.text);
}

async function add(caller: Caller, scope: 'person' | 'home', text: string): Promise<string> {
  return API_ENDPOINTS.addAiMemory.response.parse(
    await run(routes.addAiMemory, caller, { body: { scope, text } }),
  ).id;
}

describe('the memory endpoints', () => {
  it('keep a member note from the owner and from other members', async () => {
    const id = await add(ida, 'person', 'Ida likes tea');

    expect(await listed(ida)).toStrictEqual(['Ida likes tea']);
    expect(await listed(owner)).toStrictEqual([]);
    expect(await listed(kid)).toStrictEqual([]);
    for (const other of [owner, kid]) {
      expect(
        await refusal(
          run(routes.changeAiMemory, other, { params: { memoryId: id }, body: { text: 'seen' } }),
        ),
      ).toBe('not_found');
      expect(await refusal(run(routes.removeAiMemory, other, { params: { memoryId: id } }))).toBe(
        'not_found',
      );
    }
    expect(await listed(ida)).toStrictEqual(['Ida likes tea']);
  });

  it('let only an owner write what the whole home remembers', async () => {
    const id = await add(owner, 'home', 'Bins on Tuesday');

    expect(await refusal(add(ida, 'home', 'x'))).toBe('forbidden');
    expect(await listed(ida)).toStrictEqual(['Bins on Tuesday']);
    expect(await listed(kid)).toStrictEqual(['Bins on Tuesday']);
    expect(
      await refusal(
        run(routes.changeAiMemory, ida, { params: { memoryId: id }, body: { text: 'x' } }),
      ),
    ).toBe('forbidden');
    expect(await refusal(run(routes.removeAiMemory, ida, { params: { memoryId: id } }))).toBe(
      'forbidden',
    );
    expect(await refusal(run(routes.forgetAiMemories, ida, { query: { scope: 'home' } }))).toBe(
      'forbidden',
    );
    await run(routes.changeAiMemory, owner, {
      params: { memoryId: id },
      body: { text: 'Bins on Monday' },
    });
    expect(await listed(kid)).toStrictEqual(['Bins on Monday']);
  });

  it('forget everything of one scope and turn memory off per person', async () => {
    await add(ida, 'person', 'a');
    await add(ida, 'person', 'b');
    await add(kid, 'person', 'kid');

    const forgotten = await run(routes.forgetAiMemories, ida, { query: { scope: 'person' } });
    const settings = await run(routes.changeAiMemorySettings, kid, {
      body: { enabled: false, prompt_chars: 300 },
    });

    expect(API_ENDPOINTS.forgetAiMemories.response.parse(forgotten).removed).toBe(2);
    expect(await listed(ida)).toStrictEqual([]);
    expect(await listed(kid)).toStrictEqual(['kid']);
    expect(settings).toStrictEqual({ enabled: false, prompt_chars: 300 });
    expect(
      API_ENDPOINTS.listAiMemories.response.parse(await run(routes.listAiMemories, kid)).settings,
    ).toStrictEqual({ enabled: false, prompt_chars: 300 });
    expect(
      API_ENDPOINTS.listAiMemories.response.parse(await run(routes.listAiMemories, ida)).settings,
    ).toStrictEqual({ enabled: true, prompt_chars: null });
  });

  it('need a paired app', async () => {
    expect(await refusal(run(routes.listAiMemories, { kind: 'anonymous' }))).toBe('forbidden');
  });
});
