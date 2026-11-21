import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { partCallOf, toolNamed } from '../../src/extensions/mcp/tools';
import {
  ownerUpdateChat,
  ownerUpdateRequester,
  requireOwnerConnection,
  requireUpdateRequester,
} from '../../src/extensions/mcp/tools/update-requester';
import { releaseKeys } from '../../src/extensions/mcp/tools/update-release-keys';
import { requireSourceFields } from '../../src/extensions/mcp/tools/update-source';
import { systemClock } from '../../src/clock';
import { hubLayout } from '../../src/data-layout';
import { trustedReleaseKeys } from '../../src/releases/trust';
import { SecretStore } from '../../src/secrets/store';
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
      'rollback',
      'release_keys',
      'discard',
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
    expect(partCallOf('update_control', { action: 'rollback', artifact: 'hub', id })).toEqual({
      name: 'update_rollback',
      args: { artifact: 'hub', id },
    });
    expect(partCallOf('update_control', { action: 'release_keys', operation: 'list' })).toEqual({
      name: 'update_release_keys',
      args: { operation: 'list' },
    });
    expect(
      partCallOf('update_control', { action: 'release_keys', operation: 'set', token: 'x' }),
    ).toEqual({ name: 'update_release_keys', args: { operation: 'set', token: 'x' } });
    const upload = randomUUID();
    expect(partCallOf('update_control', { action: 'discard', upload })).toEqual({
      name: 'update_discard',
      args: { upload },
    });
  });

  it('has no environment switch that disables app, ui or desktop publishing', () => {
    const tools = join(import.meta.dirname, '../../src/extensions/mcp/tools');
    const files = readdirSync(tools).filter((name) => name.startsWith('update'));
    expect(files).toContain('update-publish.ts');
    for (const file of files)
      expect(readFileSync(join(tools, file), 'utf8')).not.toMatch(
        /ALLOW_APP|process\.env|from 'node:process'/u,
      );
  });

  it('refuses automatic repair service authority for an otherwise eligible owner chat', async () => {
    const authority = owner.authority;
    if (authority === undefined) throw new Error('Missing fixture authority');
    expect(
      await ownerUpdateChat({
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

  it('allows only retained owner repair authority in its canonical repair chat', async () => {
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
    expect(await ownerUpdateChat({ store, caller: null, actor })).toBe(chat.id);
    expect(
      await ownerUpdateChat({ store, caller: null, actor: { ...actor, chatId: owner.chatId } }),
    ).toBeNull();
    expect(
      await ownerUpdateChat({
        store,
        caller: null,
        actor: {
          ...actor,
          authority: { ...authority, event_id: randomUUID() },
        },
      }),
    ).toBeNull();
    expect(
      await ownerUpdateChat({
        store,
        caller: null,
        actor: {
          ...actor,
          authority: { ...authority, repair_origin: randomUUID() },
        },
      }),
    ).toBeNull();
    expect(
      await ownerUpdateChat({
        store,
        caller: null,
        actor: {
          ...actor,
          authority: { ...authority, plugin_id: 'discord' },
        },
      }),
    ).toBeNull();
  });

  it('allows the owner’s own authenticated chat', async () => {
    expect(await ownerUpdateChat({ store: fixture.store, caller: null, actor: owner })).toBe(
      owner.chatId,
    );
  });

  it.each([
    { role: 'member' as const },
    { profileId: randomUUID() },
    { clientId: null },
    { chatId: null },
    { pluginId: 'discord' },
  ])('refuses an invalid initiating chat: %j', async (change) => {
    await expect(
      requireUpdateRequester({
        store: fixture.store,
        caller: null,
        actor: { ...owner, ...change },
      }),
    ).rejects.toThrow(/Only the owner/);
  });

  it.each(['personal', 'oauth', 'computer'] as const)(
    'lets an owner %s MCP connection act as the home owner with no chat',
    async (via) => {
      const { store } = fixture;
      const caller = {
        kind: 'accepted',
        via,
        id: randomUUID(),
        localOnly: true,
        readOnly: false,
      } as const;
      expect(await ownerUpdateRequester({ store, actor: null, caller })).toEqual({
        profileId: store.personAccess.homeOwner(),
        chatId: null,
      });
      expect(await ownerUpdateRequester({ store, actor: owner, caller })).toEqual({
        profileId: owner.profileId,
        chatId: null,
      });
    },
  );

  it('refuses plugin connections and anyone who is not the owner over MCP', async () => {
    const { store } = fixture;
    const accepted = {
      kind: 'accepted',
      id: randomUUID(),
      localOnly: true,
      readOnly: false,
    } as const;
    const personal = { ...accepted, via: 'personal' } as const;
    expect(
      await ownerUpdateRequester({ store, actor: null, caller: { ...accepted, via: 'plugin' } }),
    ).toBeNull();
    expect(
      await ownerUpdateRequester({ store, actor: { ...owner, role: 'member' }, caller: personal }),
    ).toBeNull();
    expect(
      await ownerUpdateRequester({
        store,
        actor: { ...owner, pluginId: 'discord' },
        caller: personal,
      }),
    ).toBeNull();
    expect(
      await ownerUpdateRequester({
        store,
        actor: { ...owner, profileId: randomUUID() },
        caller: personal,
      }),
    ).toBeNull();
  });

  it('keeps the in-chat requester tied to its chat', async () => {
    expect(
      await ownerUpdateRequester({ store: fixture.store, caller: null, actor: owner }),
    ).toEqual({
      profileId: owner.profileId,
      chatId: owner.chatId,
    });
    expect(
      await ownerUpdateRequester({ store: fixture.store, caller: null, actor: null }),
    ).toBeNull();
  });

  it('changes trusted release keys only through the owner’s own MCP connection called directly', async () => {
    const { store } = fixture;
    const personal = {
      kind: 'accepted',
      via: 'personal',
      id: randomUUID(),
      localOnly: true,
      readOnly: false,
    } as const;
    expect(await requireOwnerConnection({ store, caller: personal, actor: null })).toBe(
      store.personAccess.homeOwner(),
    );
    await expect(requireOwnerConnection({ store, caller: null, actor: owner })).rejects.toThrow(
      /Only the owner’s own MCP connection/,
    );
    await expect(requireOwnerConnection({ store, caller: personal, actor: owner })).rejects.toThrow(
      /Only the owner’s own MCP connection/,
    );
    await expect(
      requireOwnerConnection({ store, caller: { ...personal, via: 'plugin' }, actor: null }),
    ).rejects.toThrow(/Only the owner’s own MCP connection/);
  });

  it('refuses trust and remove from the owner’s AI chat and still lets it list', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hub-release-keys-'));
    try {
      const layout = hubLayout(directory, {});
      const context = {
        store: fixture.store,
        caller: null,
        actor: owner,
        layout,
        clock: systemClock,
        releaseSecrets: await SecretStore.open(join(directory, 'secrets.enc'), randomBytes(32)),
      };
      const publicKey = generateKeyPairSync('ed25519')
        .publicKey.export({ format: 'der', type: 'spki' })
        .subarray(-32)
        .toString('base64');
      await expect(
        releaseKeys(context, { operation: 'trust', publicKey, role: 'machine', label: 'Injected' }),
      ).rejects.toThrow(/Only the owner’s own MCP connection/);
      await expect(
        releaseKeys(context, { operation: 'remove', fingerprint: 'a'.repeat(64) }),
      ).rejects.toThrow(/Only the owner’s own MCP connection/);
      expect(await trustedReleaseKeys(layout.system.keys.releaseKeys)).toEqual([]);
      const listed = await releaseKeys(context, { operation: 'list' });
      expect(listed.structured).toMatchObject({ operation: 'list', changed: null, keys: [] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('stores and clears the GitHub release token only over the owner’s own MCP connection', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hub-release-token-'));
    try {
      const path = join(directory, 'secrets.enc');
      const key = randomBytes(32);
      const releaseSecrets = await SecretStore.open(path, key);
      const personal = {
        kind: 'accepted',
        via: 'personal',
        id: randomUUID(),
        localOnly: true,
        readOnly: false,
      } as const;
      const layout = hubLayout(directory, {});
      const direct = {
        store: fixture.store,
        caller: personal,
        actor: null,
        layout,
        clock: systemClock,
        releaseSecrets,
      };
      const token = 'github_pat_release_read_only';
      const set = await releaseKeys(direct, { operation: 'set', token });
      expect(set.structured).toMatchObject({ operation: 'set', githubTokenStored: true });
      expect(JSON.stringify(set)).not.toContain(token);
      expect(readFileSync(path, 'utf8')).not.toContain(token);
      expect(releaseSecrets.githubReleaseToken()).toBe(token);
      expect((await SecretStore.open(path, key)).githubReleaseToken()).toBe(token);
      expect((await releaseKeys(direct, { operation: 'list' })).structured).toMatchObject({
        operation: 'list',
        githubTokenStored: true,
      });
      await expect(releaseKeys(direct, { operation: 'set' })).rejects.toThrow(/set needs token/);
      await expect(releaseKeys(direct, { operation: 'clear', token })).rejects.toThrow(
        /clear does not take token/,
      );
      const cleared = await releaseKeys(direct, { operation: 'clear' });
      expect(cleared.structured).toMatchObject({
        operation: 'clear',
        githubTokenStored: false,
      });
      expect(releaseSecrets.githubReleaseToken()).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses to set or clear the release token from the owner’s AI chat or repair chat', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hub-release-token-'));
    try {
      const releaseSecrets = await SecretStore.open(
        join(directory, 'secrets.enc'),
        randomBytes(32),
      );
      await releaseSecrets.saveGithubReleaseToken('kept-token');
      const authority = owner.authority;
      if (authority === undefined) throw new Error('Missing fixture authority');
      const repair: ToolActor = {
        ...owner,
        clientId: null,
        authority: { ...authority, kind: 'service', client_id: null, repair_origin: randomUUID() },
      };
      for (const actor of [owner, repair]) {
        const context = {
          store: fixture.store,
          caller: null,
          actor,
          layout: hubLayout(directory, {}),
          clock: systemClock,
          releaseSecrets,
        };
        await expect(
          releaseKeys(context, { operation: 'set', token: 'injected-token' }),
        ).rejects.toThrow(/Only the owner/);
        await expect(releaseKeys(context, { operation: 'clear' })).rejects.toThrow(
          /Only the owner/,
        );
      }
      expect(releaseSecrets.githubReleaseToken()).toBe('kept-token');
      const shown = await releaseKeys(
        {
          store: fixture.store,
          caller: null,
          actor: owner,
          layout: hubLayout(directory, {}),
          clock: systemClock,
          releaseSecrets,
        },
        { operation: 'list' },
      );
      expect(shown.structured).toMatchObject({ operation: 'list', githubTokenStored: true });
      expect(JSON.stringify(shown)).not.toContain('kept-token');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses source fields that do not fit the source', () => {
    const upload = randomUUID();
    const commit = 'a'.repeat(40);
    expect(() => {
      requireSourceFields({ source: 'provided', upload, tag: 'v1' });
    }).toThrow(/only the upload ID/);
    expect(() => {
      requireSourceFields({ upload });
    }).toThrow(/need an explicit source/);
    expect(() => {
      requireSourceFields({ tag: 'v1' });
    }).toThrow(/need an explicit source/);
    expect(() => {
      requireSourceFields({ source: 'provided', commit });
    }).toThrow(/staged upload ID/);
    expect(() => {
      requireSourceFields({ source: 'github', upload });
    }).toThrow(/does not take an upload ID/);
    expect(() => {
      requireSourceFields({ source: 'github' });
    }).toThrow(/exactly one of tag or commit/);
    expect(() => {
      requireSourceFields({ source: 'hub', tag: 'v1' });
    }).toThrow(/only an optional commit/);
    expect(() => {
      requireSourceFields({ source: 'github', tag: 'v1' });
    }).not.toThrow();
    expect(() => {
      requireSourceFields({});
    }).not.toThrow();
  });
});
