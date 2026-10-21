import { randomUUID } from 'node:crypto';
import { DEFAULT_ENGINE, type AiChatRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  admitExecutionTool,
  eventAuthority,
  executionRole,
  foldAuthorities,
  withExecutionAuthority,
} from '../../../src/assistant/turn-authority';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import type { Caller } from '../../../src/server/auth';
import { commandPrincipal } from '../../../src/server/commands';
import type { StoredEvent } from '../../../src/store/repositories/assistant-events';
import { testStore, type TestStore } from '../../support/store';
import { scopedToolCall } from '../../../src/extensions/mcp/tools/authority';

let opened: TestStore;
let profileId: string;
let ownerId: string;
let memberId: string;

beforeEach(async () => {
  opened = await testStore();
  const owner = opened.store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a' },
    true,
  );
  const member = opened.store.clients.create({
    name: 'Guest phone',
    platform: 'android',
    role: 'member',
    tokenHash: 'b',
  });
  ownerId = owner.id;
  memberId = member.id;
  profileId = opened.store.profiles.activeOf(owner.id).id;
});

afterEach(async () => {
  await opened.close();
});

function chat(options: {
  readonly parent?: AiChatRow;
  readonly tools?: readonly string[];
  readonly profile?: string;
}): AiChatRow {
  return opened.store.aiChats.create({
    profileId: options.profile ?? profileId,
    kind: options.parent === undefined ? 'chat' : 'subagent',
    title: 'Chat',
    icon: null,
    parentId: options.parent?.id ?? null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
    tools: options.tools ?? null,
  });
}

function event(target: AiChatRow, clientId: string | null): StoredEvent {
  return opened.store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: target.id,
    message_id: null,
    profile_id: target.profile_id,
    client_id: clientId,
    text: 'work',
  });
}

function authority(overrides: Partial<ConversationAuthority> = {}): ConversationAuthority {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    client_id: ownerId,
    kind: 'client',
    role: 'owner',
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
    ...overrides,
  };
}

describe('a tool grant', () => {
  it('admits a routed tool by its served name, never by the internal part it runs', () => {
    const granted = chat({ tools: ['device_find'] });
    const scoped = eventAuthority(opened.store, event(granted, ownerId));
    const context = { store: opened.store, actor: null, caller: null };
    const run = (servedTool?: string): unknown =>
      withExecutionAuthority(scoped, () =>
        scopedToolCall(
          servedTool === undefined ? context : { ...context, servedTool },
          'list_devices',
          () => ({ structured: { ran: true } }),
        ),
      );
    expect(run('device_find')).toStrictEqual({ structured: { ran: true } });
    expect(() => run()).toThrow('does not expose this tool');
  });
});

describe('child turn authority', () => {
  it('intersects a child tool grant with its parent and cannot widen it', () => {
    const parent = chat({ tools: ['a', 'b'] });
    const child = chat({ parent, tools: ['a', 'b'] });
    const parentAuthority = eventAuthority(opened.store, event(parent, ownerId));
    const source = { ...parentAuthority, tools: ['a'] };
    const childAuthority = eventAuthority(opened.store, event(child, ownerId), source);

    expect(childAuthority.tools).toEqual(['a']);
    expect(() => {
      admitExecutionTool(opened.store, 'a', childAuthority);
    }).not.toThrow();
    expect(() => {
      admitExecutionTool(opened.store, 'b', childAuthority);
    }).toThrow('does not expose this tool');
  });

  it('keeps the child chat grant when the parent allows every tool', () => {
    const parent = chat({});
    const child = chat({ parent, tools: ['a'] });
    const parentAuthority = eventAuthority(opened.store, event(parent, ownerId));
    const childAuthority = eventAuthority(opened.store, event(child, ownerId), parentAuthority);

    expect(childAuthority.tools).toEqual(['a']);
  });

  it('makes the child a member when the parent turn is a member, whoever queues it', () => {
    const parent = chat({});
    const child = chat({ parent });
    const parentAuthority = eventAuthority(opened.store, event(parent, memberId));
    const childAuthority = eventAuthority(opened.store, event(child, ownerId), parentAuthority);

    expect(executionRole(parentAuthority)).toBe('member');
    expect(childAuthority.role).toBe('member');
    expect(childAuthority.client_id).toBe(memberId);
  });

  it('keeps an owner parent and owner client as owner', () => {
    const parent = chat({});
    const child = chat({ parent });
    const parentAuthority = eventAuthority(opened.store, event(parent, ownerId));

    expect(eventAuthority(opened.store, event(child, ownerId), parentAuthority).role).toBe('owner');
  });

  it('refuses a source from another profile', () => {
    const other = opened.store.profiles.create({ name: 'Guest' });
    const target = chat({ profile: other.id });
    expect(() => eventAuthority(opened.store, event(target, ownerId), authority())).toThrow(
      'cannot change its initiating profile',
    );
  });

  it('refuses a child that combines two initiating plugins', () => {
    const target = chat({});
    const source = authority({ plugin_id: 'one' });
    expect(() =>
      withExecutionAuthority(authority({ plugin_id: 'two' }), () =>
        eventAuthority(opened.store, event(target, ownerId), source),
      ),
    ).toThrow('ambiguous initiating plugins');
  });
});

describe('folded authorities', () => {
  it('folds an owner and a member into a member with the tools intersected', () => {
    const folded = foldAuthorities([
      authority({ tools: ['a', 'b'] }),
      authority({ role: 'member', client_id: memberId, hub_os_ban: true, tools: ['b', 'c'] }),
      authority({ tools: null }),
    ]);

    expect(folded).toMatchObject({ role: 'member', hub_os_ban: true, tools: ['b'] });
  });

  it('keeps owner only when every source is an owner', () => {
    expect(foldAuthorities([authority(), authority()])?.role).toBe('owner');
  });

  it('returns a single source unchanged and nothing for none', () => {
    const only = authority({ tools: ['a'] });
    expect(foldAuthorities([only])).toBe(only);
    expect(foldAuthorities([])).toBeUndefined();
  });

  it('refuses sources from two different plugins', () => {
    expect(() =>
      foldAuthorities([authority({ plugin_id: 'one' }), authority({ plugin_id: 'two' })]),
    ).toThrow('ambiguous initiating plugins');
  });
});

describe('hub commands issued by unattended work', () => {
  function service(value: ConversationAuthority): Caller {
    return { kind: 'service', authority: value, profileId: value.profile_id, chatId: null };
  }

  it('carry the role the work was started with', () => {
    expect(commandPrincipal(opened.store, service(authority()))).toEqual({
      clientId: null,
      role: 'owner',
      profileId,
      devices: null,
    });
    expect(commandPrincipal(opened.store, service(authority({ role: 'member' })))).toEqual({
      clientId: null,
      role: 'member',
      profileId,
      devices: { mode: 'all', devices: [], rooms: [], hidden: [] },
    });
  });
});
