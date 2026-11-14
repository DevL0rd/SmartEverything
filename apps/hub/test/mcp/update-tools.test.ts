import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { partCallOf, toolNamed } from '../../src/extensions/mcp/tools';
import {
  ownerUpdateChat,
  ownerUpdateRequester,
  requireUpdateRequester,
} from '../../src/extensions/mcp/tools/update-requester';
import { eventAuthority } from '../../src/assistant/turn-authority';
import type { ToolActor } from '../../src/extensions/mcp/tools/registry';
import { TEST_ENGINE } from '../support/engine';
import { testStore, type TestStore } from '../support/store';

let fixture: TestStore;
let owner: ToolActor;

beforeEach(async () => {
  fixture = await testStore();
  const { store } = fixture;
  const profileId = store.profiles.first().id;
  const client = store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  const chat = store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Update',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  });
  owner = {
    chatId: chat.id,
    clientId: client.id,
    profileId,
    role: 'owner',
    authority: {
      event_id: randomUUID(),
      profile_id: profileId,
      client_id: client.id,
      kind: 'client',
      role: 'owner',
      hub_os_ban: true,
      tools: null,
      plugin_id: null,
      requester: null,
    },
  };
});

afterEach(async () => {
  await fixture.close();
});

describe('the update tools', () => {
  it('registers only implemented actions and routes each without colliding with its selector', () => {
    expect([...(toolNamed('update_control')?.variants?.keys() ?? [])]).toEqual([
      'status',
      'hub',
      'app',
      'ui',
      'desktop',
      'recover',
    ]);
    expect(partCallOf('chat_file_send', { path: '/a', what: 'A file' })).toEqual({
      name: 'chat_file_send',
      args: { path: '/a', what: 'A file' },
    });
    expect(partCallOf('repair_claim', { component: 'hub.service' })).toEqual({
      name: 'repair_claim',
      args: { component: 'hub.service' },
    });
    expect(partCallOf('update_control', { action: 'hub', notes: 'Repair startup' })).toEqual({
      name: 'update_hub',
      args: { notes: 'Repair startup' },
    });
    const id = randomUUID();
    expect(partCallOf('update_control', { action: 'status', id })).toEqual({
      name: 'update_status',
      args: { id },
    });
    const test = { runId: id, clientId: randomUUID(), notes: 'Check layout', channel: 'dev' };
    expect(partCallOf('update_control', { ...test, action: 'ui' })).toEqual({
      name: 'update_ui',
      args: test,
    });
    const desktop = { runId: id, notes: 'Desktop update', arches: ['x64', 'arm64'] };
    expect(partCallOf('update_control', { ...desktop, action: 'desktop' })).toEqual({
      name: 'update_desktop',
      args: desktop,
    });
    const release = { runId: id, notes: 'Native update' };
    expect(partCallOf('update_control', { ...release, action: 'app' })).toEqual({
      name: 'update_app',
      args: release,
    });
    expect(partCallOf('update_control', { action: 'recover', id })).toEqual({
      name: 'update_recover',
      args: { id },
    });
  });

  it('has no environment switch that disables app, ui or desktop publishing', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../../src/extensions/mcp/tools/update.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/ALLOW_APP|process\.env|from 'node:process'/u);
  });

  it('refuses automatic repair service authority for an otherwise eligible owner chat', () => {
    const authority = owner.authority;
    if (authority === undefined) throw new Error('Missing fixture authority');
    expect(
      ownerUpdateChat({
        store: fixture.store,
        caller: null,
        actor: {
          ...owner,
          authority: {
            ...authority,
            kind: 'service',
            client_id: null,
            repair_origin: randomUUID(),
          },
        },
      }),
    ).toBeNull();
  });

  it('allows only retained owner repair authority in its canonical repair chat', () => {
    const { store } = fixture;
    const chat = store.aiChats.create({
      profileId: owner.profileId,
      kind: 'chat',
      title: 'AI repair',
      icon: null,
      parentId: null,
      sourceKey: 'repair:server\0hub:service',
      engine: TEST_ENGINE,
    });
    const event = store.assistantEvents.add({
      id: randomUUID(),
      kind: 'chat',
      chat_id: chat.id,
      profile_id: owner.profileId,
      client_id: null,
      message_id: null,
      text: 'Repair',
    });
    const authority = eventAuthority(store, event, undefined, event.id);
    const actor = { ...owner, chatId: chat.id, clientId: null, authority };
    expect(ownerUpdateChat({ store, caller: null, actor })).toBe(chat.id);
    expect(
      ownerUpdateChat({ store, caller: null, actor: { ...actor, chatId: owner.chatId } }),
    ).toBeNull();
    expect(
      ownerUpdateChat({
        store,
        caller: null,
        actor: {
          ...actor,
          authority: { ...authority, event_id: randomUUID() },
        },
      }),
    ).toBeNull();
    expect(
      ownerUpdateChat({
        store,
        caller: null,
        actor: {
          ...actor,
          authority: { ...authority, repair_origin: randomUUID() },
        },
      }),
    ).toBeNull();
    expect(
      ownerUpdateChat({
        store,
        caller: null,
        actor: {
          ...actor,
          authority: { ...authority, plugin_id: 'discord' },
        },
      }),
    ).toBeNull();
  });

  it('allows the owner’s own authenticated chat', () => {
    expect(ownerUpdateChat({ store: fixture.store, caller: null, actor: owner })).toBe(
      owner.chatId,
    );
  });

  it.each([
    { role: 'member' as const },
    { profileId: randomUUID() },
    { clientId: null },
    { chatId: null },
    { pluginId: 'discord' },
  ])('refuses an invalid initiating chat: %j', (change) => {
    expect(() =>
      requireUpdateRequester({
        store: fixture.store,
        caller: null,
        actor: { ...owner, ...change },
      }),
    ).toThrow(/Only the owner/);
  });

  it.each(['personal', 'oauth', 'computer'] as const)(
    'lets an owner %s MCP connection act as the home owner with no chat',
    (via) => {
      const { store } = fixture;
      const caller = {
        kind: 'accepted',
        via,
        id: randomUUID(),
        localOnly: true,
        readOnly: false,
      } as const;
      expect(ownerUpdateRequester({ store, actor: null, caller })).toEqual({
        profileId: store.personAccess.homeOwner(),
        chatId: null,
      });
      expect(ownerUpdateRequester({ store, actor: owner, caller })).toEqual({
        profileId: owner.profileId,
        chatId: null,
      });
    },
  );

  it('refuses plugin connections and anyone who is not the owner over MCP', () => {
    const { store } = fixture;
    const accepted = {
      kind: 'accepted',
      id: randomUUID(),
      localOnly: true,
      readOnly: false,
    } as const;
    const personal = { ...accepted, via: 'personal' } as const;
    expect(
      ownerUpdateRequester({ store, actor: null, caller: { ...accepted, via: 'plugin' } }),
    ).toBeNull();
    expect(
      ownerUpdateRequester({ store, actor: { ...owner, role: 'member' }, caller: personal }),
    ).toBeNull();
    expect(
      ownerUpdateRequester({ store, actor: { ...owner, pluginId: 'discord' }, caller: personal }),
    ).toBeNull();
    expect(
      ownerUpdateRequester({
        store,
        actor: { ...owner, profileId: randomUUID() },
        caller: personal,
      }),
    ).toBeNull();
  });

  it('keeps the in-chat requester tied to its chat', () => {
    expect(ownerUpdateRequester({ store: fixture.store, caller: null, actor: owner })).toEqual({
      profileId: owner.profileId,
      chatId: owner.chatId,
    });
    expect(ownerUpdateRequester({ store: fixture.store, caller: null, actor: null })).toBeNull();
  });
});
