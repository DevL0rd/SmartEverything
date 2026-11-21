import {
  AI_DEFAULT_MODEL,
  ApiError,
  DSH_ENGINE_REQUEST,
  DSH_SESSION_ID,
  type Engine,
} from '@smarteverything/domain';
import { meteredRouteId } from '../../src/openrouter/metered-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatDirectory, type ChatOwner } from '../../src/assistant/chat-directory';
import { AssistantFiles } from '../../src/assistant/files';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { CLAUDE_TEST_ENGINE, TEST_ENGINE } from '../support/engine';
import { hubLayout } from '../../src/data-layout';

let opened: TestStore;
let owner: ChatOwner;
let checked: Engine[];
let refuse: boolean;
let chats: ChatDirectory;

const now = (): Date => new Date('2026-10-10T08:00:00.000Z');

const GPT = DSH_ENGINE_REQUEST.parse({ kind: 'dsh', model: 'openai/gpt-6-luna' });

function onTheHub(profileId: string): Engine {
  return {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model_route_id: meteredRouteId(profileId),
    model: AI_DEFAULT_MODEL,
    effort: 'low',
    permission: { sandbox: 'danger-full-access', approval: 'never' },
  };
}

function gptOnTheHub(profileId: string): Engine {
  return { ...onTheHub(profileId), model: 'openai/gpt-6-luna', effort: null };
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore(now);
  const { store } = opened;
  await store.live.aiModels.load();
  const client = store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  owner = { profileId: store.profiles.activeOf(client.id).id, role: 'owner' };
  checked = [];
  refuse = false;
  chats = new ChatDirectory(
    store,
    new AssistantFiles({
      layout: hubLayout(opened.directory, {}),
      store: store,
      attachments: store.live.attachments,
      now,
    }),
    {
      validate: (engine): void => {
        checked.push(engine);
        if (refuse) throw new ApiError('conflict', 'That engine is not available.');
      },
    },
  );
});

afterEach(async () => {
  await opened.close();
});

describe('creating a chat before any model route is known', () => {
  it('stores the default as an unopened native chat on the hub with the default model', async () => {
    const expected = onTheHub(owner.profileId);
    expect((await chats.defaultChat(owner.profileId)).engine).toEqual(expected);
    expect((await chats.forTurn(owner.profileId, undefined, undefined)).engine).toEqual(expected);
    expect((await chats.conversationChat(owner.profileId)).engine).toEqual(expected);
  });

  it('runs a chat made from a default picked on a device on the hub, with no inherited session', async () => {
    const picked: Engine = {
      kind: 'dsh',
      execution_target: { kind: 'device', device_id: '11111111-1111-4111-8111-111111111111' },
      session_id: DSH_SESSION_ID.parse('native-session'),
      model_route_id: '00000000-0000-4000-8000-000000000001',
      model: 'qwen/qwen-test',
      effort: null,
      permission: { sandbox: 'danger-full-access', approval: 'never' },
    };
    await opened.store.live.engineDefaults.update(picked);
    const expected = { ...picked, execution_target: { kind: 'server' }, session_id: null };
    expect((await chats.forTurn(owner.profileId, undefined, 'Lights')).engine).toEqual(expected);
    expect((await chats.conversationChat(owner.profileId)).engine).toEqual(expected);
    expect((await chats.create(owner, {})).engine).toEqual(expected);
    expect((await chats.create(owner, { engine: picked })).engine).toEqual(picked);
  });

  it('uses the engine the owner made the default', async () => {
    await opened.store.live.engineDefaults.update({
      ...onTheHub(owner.profileId),
      model: 'openai/gpt-5',
    });
    expect((await chats.create(owner, {})).engine).toMatchObject({
      kind: 'dsh',
      model: 'openai/gpt-5',
    });
    expect((await chats.forTurn(owner.profileId, undefined, 'Lights')).engine).toMatchObject({
      kind: 'dsh',
      model: 'openai/gpt-5',
    });
  });

  it('completes a request that names no route onto the person’s own metered route', async () => {
    const bare = DSH_ENGINE_REQUEST.parse({ kind: 'dsh' });
    expect((await chats.create(owner, { engine: bare })).engine).toMatchObject({
      kind: 'dsh',
      execution_target: { kind: 'server' },
      model_route_id: meteredRouteId(owner.profileId),
    });
  });

  it('refuses a request that names a route without the model that runs on it', async () => {
    await expect(
      chats.create(owner, {
        engine: DSH_ENGINE_REQUEST.parse({
          kind: 'dsh',
          model_route_id: meteredRouteId(owner.profileId),
          model: 'x/y',
        }),
      }),
    ).resolves.toMatchObject({ kind: 'chat' });
    const nameless = { ...GPT, model_route_id: meteredRouteId(owner.profileId), model: null };
    await expect(chats.create(owner, { engine: nameless })).rejects.toThrow('Name the model');
  });

  it('stores the engine the person asked for after checking it, and refuses one that is not available', async () => {
    expect((await chats.create(owner, { engine: GPT })).engine).toEqual(
      gptOnTheHub(owner.profileId),
    );
    expect(checked).toEqual([gptOnTheHub(owner.profileId)]);
    refuse = true;
    await expect(chats.create(owner, { engine: GPT })).rejects.toThrow(
      'That engine is not available.',
    );
    expect(
      opened.store.aiChats.chats({ profileId: owner.profileId, archived: false }),
    ).toHaveLength(1);
  });

  it('checks an engine change on an existing chat before storing it', async () => {
    const chat = await chats.create(owner, { engine: TEST_ENGINE });
    const changed = DSH_ENGINE_REQUEST.parse({ kind: 'dsh', model: 'openai/gpt-5' });
    expect((await chats.update(owner, chat.id, { engine: changed })).engine).toMatchObject({
      kind: 'dsh',
      model: 'openai/gpt-5',
    });
    refuse = true;
    await expect(chats.update(owner, chat.id, { engine: TEST_ENGINE })).rejects.toThrow(
      'That engine is not available.',
    );
    expect(opened.store.aiChats.chat(chat.id).engine).toMatchObject({ model: 'openai/gpt-5' });
  });
});

describe('dedicated repair chat identity', () => {
  it.each([false, true])(
    'reuses its source identity and preserves the configured engine and tools (native=%s)',
    async (native) => {
      const { store } = opened;
      const repair = store.aiChats.create({
        profileId: owner.profileId,
        kind: 'chat',
        title: 'AI repair',
        icon: null,
        parentId: null,
        sourceKey: 'repair:server\0hub:service',
        engine: native ? CLAUDE_TEST_ENGINE : gptOnTheHub(owner.profileId),
        ...(native ? { nativeAdmission: 'standalone' as const } : {}),
        tools: ['log_read'],
      });
      await chats.create(owner, { title: 'Latest unrelated work' });
      expect(await chats.repairChat(owner.profileId)).toMatchObject({
        id: repair.id,
        engine: repair.engine,
        tools: repair.tools,
      });
    },
  );

  it('creates a dedicated replacement after archive and never uses an unrelated latest chat', async () => {
    const first = await chats.repairChat(owner.profileId);
    opened.store.aiChats.update(first.id, { archived: true });
    const unrelated = await chats.create(owner, { title: 'AI repair' });
    const replacement = await chats.repairChat(owner.profileId);
    expect(replacement.id).not.toBe(first.id);
    expect(replacement.id).not.toBe(unrelated.id);
    expect((await chats.repairChat(owner.profileId)).id).toBe(replacement.id);
  });
});
