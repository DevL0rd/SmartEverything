import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { partCallOf, toolNamed } from '../../src/extensions/mcp/tools';
import {
  ownerUpdateChat,
  requireUpdateChat,
} from '../../src/extensions/mcp/tools/self-update-owner';
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

describe('the self-update tool', () => {
  it('registers only implemented actions and routes each without colliding with its selector', () => {
    expect([...(toolNamed('self_update')?.variants?.keys() ?? [])]).toEqual([
      'status',
      'hub',
      'app',
      'ui',
      'desktop',
      'recover',
      'file',
      'claim',
    ]);
    expect(partCallOf('self_update', { action: 'claim', component: 'hub.service' })).toEqual({
      name: 'claim_repair_work',
      args: { component: 'hub.service' },
    });
    expect(partCallOf('self_update', { action: 'hub', notes: 'Repair startup' })).toEqual({
      name: 'self_update_hub',
      args: { notes: 'Repair startup' },
    });
    const id = randomUUID();
    expect(partCallOf('self_update', { action: 'status', id })).toEqual({
      name: 'self_update_status',
      args: { id },
    });
    const test = { runId: id, clientId: randomUUID(), notes: 'Check layout', channel: 'dev' };
    expect(partCallOf('self_update', { ...test, action: 'ui' })).toEqual({
      name: 'self_update_ui',
      args: test,
    });
    const desktop = { runId: id, notes: 'Desktop update', arches: ['x64', 'arm64'] };
    expect(partCallOf('self_update', { ...desktop, action: 'desktop' })).toEqual({
      name: 'self_update_desktop',
      args: desktop,
    });
    const release = { runId: id, notes: 'Native update' };
    expect(partCallOf('self_update', { ...release, action: 'app' })).toEqual({
      name: 'self_update_app',
      args: release,
    });
  });

  it('has no environment switch that disables app, ui or desktop publishing', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../../src/extensions/mcp/tools/self-update.ts'),
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
      requireUpdateChat({ store: fixture.store, caller: null, actor: { ...owner, ...change } }),
    ).toThrow(/Only the owner/);
  });

  it('refuses an owner impersonation over a third-party MCP connection', () => {
    expect(
      ownerUpdateChat({
        store: fixture.store,
        actor: owner,
        caller: {
          kind: 'accepted',
          via: 'personal',
          id: randomUUID(),
          localOnly: true,
          readOnly: false,
        },
      }),
    ).toBeNull();
  });
});
