import { remember, everyone } from '../support/memory-service';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@smarteverything/domain';
import type { AiMemoryToolArguments, AiMemoryToolResult } from '@smarteverything/domain';
import { HubMemoryAccess } from '../../src/memory/access';
import type { MemorySessions } from '../../src/memory/access';
import type { MemoryPrincipal } from '../../src/memory/principal';
import { MemoryService } from '../../src/memory/service';
import { TEST_ENGINE } from '../support/engine';
import { FakeMemoryEmbedder } from '../support/memory-embedder';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let embedder: FakeMemoryEmbedder;
let service: MemoryService;
let owner: MemoryPrincipal;
let ida: MemoryPrincipal;
let kid: MemoryPrincipal;

const SESSIONS = new Map<string, MemoryPrincipal>();

const sessions: MemorySessions = {
  principal: (sessionId) => {
    const principal = SESSIONS.get(sessionId);
    if (principal === undefined) throw new ApiError('forbidden', 'No grant.');
    return principal;
  },
  latest: () => null,
};

function person(profileId: string, role: MemoryPrincipal['role']): MemoryPrincipal {
  return { profileId, role, chatId: null, messageId: null };
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  embedder = new FakeMemoryEmbedder();
  service = new MemoryService(opened.store.aiMemories, opened.store.aiChats, embedder, {
    judge: null,
    zone: (): string => 'UTC',
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
  });
  owner = person(opened.store.profiles.first().id, 'owner');
  ida = person(opened.store.profiles.create({ name: 'Ida' }).id, 'member');
  kid = person(opened.store.profiles.create({ name: 'Kid' }).id, 'member');
  SESSIONS.clear();
  SESSIONS.set('owner-chat', owner);
  SESSIONS.set('ida-chat', ida);
  SESSIONS.set('kid-chat', kid);
});

afterEach(async () => {
  await opened.close();
});

function chatOf(profileId: string): string {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
    titleAuto: false,
  }).id;
}

function texts(who: MemoryPrincipal): string[] {
  return service.list(who).memories.map((memory) => memory.text);
}

function firstId(result: AiMemoryToolResult): string {
  const id =
    'memories' in result
      ? result.memories[0]?.id
      : 'memory' in result
        ? result.memory.id
        : undefined;
  if (id === undefined) throw new Error('The tool result names no memory.');
  return id;
}

async function refusal(work: () => unknown): Promise<string> {
  try {
    await work();
  } catch (cause) {
    if (cause instanceof ApiError) return cause.code;
    throw cause;
  }
  return 'allowed';
}

describe('what a person asks the AI to remember', () => {
  it('stays private: no other person and not the owner can list, recall, edit or delete it', async () => {
    const secret = await remember(service, ida, {
      scope: 'person',
      text: 'Ida is saving for a surprise',
    });

    expect(texts(ida)).toStrictEqual(['Ida is saving for a surprise']);
    expect(texts(owner)).toStrictEqual([]);
    expect(texts(kid)).toStrictEqual([]);
    expect(everyone(service.recall(owner))).toStrictEqual([]);
    expect(everyone(service.recall(kid))).toStrictEqual([]);
    expect(await refusal(() => service.change(owner, secret.id, { text: 'seen' }))).toBe(
      'not_found',
    );
    expect(
      await refusal(() => {
        service.remove(owner, secret.id);
      }),
    ).toBe('not_found');
    expect(await refusal(() => service.change(kid, secret.id, { text: 'seen' }))).toBe('not_found');
    expect(
      await refusal(() => {
        service.remove(kid, secret.id);
      }),
    ).toBe('not_found');
    expect(texts(ida)).toStrictEqual(['Ida is saving for a surprise']);
  });

  it('is never read through the tool of another person, owner included', async () => {
    const access = new HubMemoryAccess(service, sessions);
    await access.call('ida-chat', {
      action: 'add',
      scope: 'person',
      text: 'Ida takes the 7:40 bus',
    });

    const asOwner = await access.call('owner-chat', { action: 'view' });
    const asKid = await access.call('kid-chat', { action: 'view', query: 'bus' });

    expect(asOwner).toStrictEqual({ memories: [] });
    expect(asKid).toStrictEqual({ memories: [] });
    expect(JSON.stringify(access.recall('owner-chat'))).not.toContain('7:40');
    expect(JSON.stringify(access.recall('kid-chat'))).not.toContain('7:40');
    expect(JSON.stringify(access.recall('ida-chat'))).toContain('7:40');
  });

  it('is recalled in every chat of its person and in no chat of another', async () => {
    await remember(service, ida, { scope: 'person', text: 'Ida likes oat milk' });
    await remember(service, kid, { scope: 'person', text: 'Kid hates peas' });

    const recalled = (who: MemoryPrincipal): readonly string[] =>
      everyone(service.recall(who)).map((memory) => memory.text);

    expect(recalled(ida)).toStrictEqual(['Ida likes oat milk']);
    expect(recalled(kid)).toStrictEqual(['Kid hates peas']);
    expect(recalled(owner)).toStrictEqual([]);
  });

  it('can be reworded and deleted by its person, which moves it to the newest', async () => {
    const first = await remember(service, ida, { scope: 'person', text: 'one' });
    await remember(service, ida, { scope: 'person', text: 'two' });

    const changed = service.change(ida, first.id, { text: 'one reworded' });
    expect(changed.memory.text).toBe('one reworded');
    service.remove(ida, first.id);

    expect(texts(ida)).toStrictEqual(['two']);
    expect(
      await refusal(() => {
        service.remove(ida, first.id);
      }),
    ).toBe('not_found');
  });

  it('remembers where it came from for its person only', async () => {
    const chat = chatOf(ida.profileId);
    const note = await remember(
      service,
      { ...ida, chatId: chat, messageId: null },
      { scope: 'person', text: 'from a chat' },
    );

    expect(note.source_chat_id).toBe(chat);
    opened.store.aiChats.remove(chat);
    expect(service.list(ida).memories[0]?.source_chat_id).toBeNull();
    expect(texts(ida)).toStrictEqual(['from a chat']);
  });
});

describe('what the whole home remembers', () => {
  it('is written, reworded and deleted by an owner only', async () => {
    const note = await remember(service, owner, {
      scope: 'home',
      text: 'The wifi is on the fridge',
    });

    expect(await refusal(() => remember(service, ida, { scope: 'home', text: 'x' }))).toBe(
      'forbidden',
    );
    expect(await refusal(() => service.change(ida, note.id, { text: 'x' }))).toBe('forbidden');
    expect(
      await refusal(() => {
        service.remove(ida, note.id);
      }),
    ).toBe('forbidden');
    expect(await refusal(() => service.forget(ida, 'home'))).toBe('forbidden');
    expect(texts(ida)).toStrictEqual(['The wifi is on the fridge']);
    expect(service.change(owner, note.id, { text: 'The wifi is in the hall' }).memory.text).toBe(
      'The wifi is in the hall',
    );
    service.remove(owner, note.id);
    expect(texts(ida)).toStrictEqual([]);
  });

  it('is recalled in the chats of every person and keeps its source from members', async () => {
    const chat = chatOf(owner.profileId);
    await remember(
      service,
      { ...owner, chatId: chat },
      { scope: 'home', text: 'Bins go out on Tuesday' },
    );

    for (const who of [owner, ida, kid])
      expect(everyone(service.recall(who)).map((memory) => memory.text)).toStrictEqual([
        'Bins go out on Tuesday',
      ]);
    expect(service.list(owner).memories[0]?.source_chat_id).toBe(chat);
    expect(service.list(ida).memories[0]?.source_chat_id).toBeNull();
    expect(service.list(kid).memories[0]?.source_message_id).toBeNull();
  });

  it('is written through the tool only when the chat runs as an owner', async () => {
    const access = new HubMemoryAccess(service, sessions);
    SESSIONS.set('owner-as-member', { ...owner, role: 'member' });

    const added = await access.call('owner-chat', {
      action: 'add',
      scope: 'home',
      text: 'Pets: Rex',
    });

    expect(added).toMatchObject({ memory: { scope: 'home', text: 'Pets: Rex' } });
    expect(
      await refusal(() => access.call('ida-chat', { action: 'add', scope: 'home', text: 'x' })),
    ).toBe('forbidden');
    expect(
      await refusal(() =>
        access.call('owner-as-member', { action: 'add', scope: 'home', text: 'x' }),
      ),
    ).toBe('forbidden');
    expect(texts(ida)).toStrictEqual(['Pets: Rex']);
  });
});

describe('forgetting everything', () => {
  it('removes all of the caller own memories and nothing of anyone else or of the home', async () => {
    await remember(service, ida, { scope: 'person', text: 'a' });
    await remember(service, ida, { scope: 'person', text: 'b' });
    await remember(service, kid, { scope: 'person', text: 'kid note' });
    await remember(service, owner, { scope: 'home', text: 'home note' });

    expect(service.forget(ida, 'person')).toBe(2);

    expect(texts(ida)).toStrictEqual(['home note']);
    expect(texts(kid).sort()).toStrictEqual(['home note', 'kid note']);
  });

  it('removes every home memory for an owner and no person memory', async () => {
    await remember(service, ida, { scope: 'person', text: 'ida note' });
    await remember(service, owner, { scope: 'home', text: 'one' });
    await remember(service, owner, { scope: 'home', text: 'two' });

    expect(service.forget(owner, 'home')).toBe(2);

    expect(texts(ida)).toStrictEqual(['ida note']);
  });

  it('follows the person: deleting a profile deletes its memories', async () => {
    await remember(service, kid, { scope: 'person', text: 'kid note' });
    await remember(service, owner, { scope: 'home', text: 'home note' });

    opened.store.profiles.remove(kid.profileId);

    expect(
      opened.store.aiMemories.visible(owner.profileId).map((memory) => memory.text),
    ).toStrictEqual(['home note']);
    expect(opened.store.aiMemories.forgetHome()).toBe(1);
  });
});

describe('the per-person off switch', () => {
  it('hides the tool, recalls nothing and refuses calls for that person only', async () => {
    const access = new HubMemoryAccess(service, sessions);
    await remember(service, ida, { scope: 'person', text: 'Ida note' });
    await remember(service, kid, { scope: 'person', text: 'Kid note' });
    await remember(service, owner, { scope: 'home', text: 'Home note' });

    service.changeSettings(ida, { enabled: false });

    expect(access.offered('ida-chat')).toBe(false);
    expect(everyone(access.recall('ida-chat'))).toStrictEqual([]);
    expect(await refusal(() => access.call('ida-chat', { action: 'view' }))).toBe('forbidden');
    expect(access.offered('kid-chat')).toBe(true);
    expect(
      everyone(access.recall('kid-chat'))
        .map((memory) => memory.text)
        .sort(),
    ).toStrictEqual(['Home note', 'Kid note']);
    expect(texts(ida).sort()).toStrictEqual(['Home note', 'Ida note']);
  });

  it('brings the notes back when turned on again and keeps the character setting', async () => {
    await remember(service, ida, { scope: 'person', text: 'Ida note' });
    service.changeSettings(ida, { enabled: false, prompt_chars: 400 });
    service.changeSettings(ida, { enabled: true });

    expect(service.settings(ida)).toStrictEqual({ enabled: true, prompt_chars: 400 });
    expect(service.recall(ida)).toMatchObject({ prompt_chars: 400, time_zone: 'UTC' });
    expect(everyone(service.recall(ida))).toHaveLength(1);
    service.changeSettings(ida, { prompt_chars: null });
    expect(service.settings(ida).prompt_chars).toBeNull();
  });

  it('starts on with every memory shown', () => {
    expect(service.settings(ida)).toStrictEqual({ enabled: true, prompt_chars: null });
  });
});

describe('the memory tool', () => {
  const access = (): HubMemoryAccess => new HubMemoryAccess(service, sessions);

  function run(session: string, args: AiMemoryToolArguments): Promise<AiMemoryToolResult> {
    return access().call(session, args);
  }

  it('views by scope and by every word of a query, and edits and deletes by id', async () => {
    await run('ida-chat', { action: 'add', scope: 'person', text: 'Likes green tea' });
    await run('owner-chat', {
      action: 'add',
      scope: 'home',
      text: 'Green bin is for garden waste',
    });

    const green = await run('ida-chat', { action: 'view', query: 'GREEN' });
    const tea = await run('ida-chat', { action: 'view', query: 'green tea' });
    const homeOnly = await run('ida-chat', { action: 'view', scope: 'home' });

    expect(green).toMatchObject({ memories: [{}, {}] });
    expect(tea).toMatchObject({ memories: [{ text: 'Likes green tea' }] });
    expect(homeOnly).toMatchObject({ memories: [{ text: 'Green bin is for garden waste' }] });
    const id = firstId(tea);
    expect(await run('ida-chat', { action: 'edit', id, text: 'Likes black tea' })).toMatchObject({
      memory: { id, text: 'Likes black tea' },
    });
    expect(await run('ida-chat', { action: 'delete', id })).toStrictEqual({ deleted: id });
  });

  it('shows each note with when it was saved and how long ago instead of a raw timestamp', async () => {
    const added = await run('ida-chat', {
      action: 'add',
      scope: 'person',
      text: 'Likes green tea',
    });
    const viewed = await run('ida-chat', { action: 'view' });

    const saved = /^saved \d{4}-\d{2}-\d{2} \d{2}:\d{2}, just now$/u;
    expect('memory' in added ? added.memory.saved : '').toMatch(saved);
    expect('memories' in viewed ? viewed.memories.map((memory) => memory.saved) : []).toHaveLength(
      1,
    );
    expect('memories' in viewed ? (viewed.memories[0]?.saved ?? '') : '').toMatch(saved);
    expect(JSON.stringify(viewed)).not.toContain('updated_at');
  });

  it('cannot edit or delete the memory of another person by guessing its id', async () => {
    const added = await run('ida-chat', { action: 'add', scope: 'person', text: 'Private' });
    const id = firstId(added);

    expect(await refusal(() => run('owner-chat', { action: 'edit', id, text: 'x' }))).toBe(
      'not_found',
    );
    expect(await refusal(() => run('kid-chat', { action: 'delete', id }))).toBe('not_found');
    expect(texts(ida)).toStrictEqual(['Private']);
  });

  it('refuses a session without an execution grant', async () => {
    expect(await refusal(() => run('unknown-chat', { action: 'view' }))).toBe('forbidden');
  });
});
