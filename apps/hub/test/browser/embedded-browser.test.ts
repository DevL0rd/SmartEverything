import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  EmbeddedBrowserRequest,
  EmbeddedBrowserResult,
  EmbeddedBrowserScope,
} from '@smarteverything/domain';
import { withProviderToolAuthority } from '../../src/assistant/engines/computer/tool-authority';
import { eventAuthority } from '../../src/assistant/turn-authority';
import type { Caller } from '../../src/server/auth';
import { EmbeddedBrowserAuthority } from '../../src/browser/embedded-browser-authority';
import { EmbeddedBrowserControllers } from '../../src/browser/embedded-browser-controllers';
import { ViewerFocus } from '../../src/browser/viewer-focus';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
let controllers: EmbeddedBrowserControllers;
let chat: string;
let projects: string;

beforeEach(async () => {
  rig = await harnessRig();
  chat = rig.newChat({ kind: 'server' }).id;
  projects = mkdtempSync(join(tmpdir(), 'se-browser-'));
  mkdirSync(join(projects, chat, 'workspace', 'site'), { recursive: true });
  writeFileSync(join(projects, chat, 'workspace', 'site', 'index.html'), '<p>hi</p>');
  controllers = new EmbeddedBrowserControllers(
    rig.opened.store,
    new EmbeddedBrowserAuthority(rig.opened.store),
    new ViewerFocus(),
    { root: (id: string): string => join(projects, id) },
  );
});

afterEach(async () => {
  controllers.stop();
  rmSync(projects, { recursive: true, force: true });
  await rig.close();
});

function caller(): Caller {
  return { kind: 'client', client: rig.opened.store.clients.byId(rig.clientId) };
}

function nativeBrowserCall<T>(work: (actor: Caller) => T): T {
  const { store } = rig.opened;
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat,
    message_id: null,
    profile_id: rig.owner.profileId,
    client_id: rig.clientId,
    text: 'Show the preview here.',
  });
  return withProviderToolAuthority({ validate: () => undefined, hubOsBan: false }, () =>
    work({
      kind: 'client',
      client: store.clients.byId(rig.clientId),
      via: 'assistant',
      chatId: chat,
      authority: eventAuthority(store, event),
    }),
  );
}

function viewer(
  clientId: string,
  seen?: EmbeddedBrowserRequest['operation'][],
): EmbeddedBrowserScope {
  const scope: EmbeddedBrowserScope = {
    viewerId: randomUUID(),
    generation: randomUUID(),
    clientId,
    profileId: rig.owner.profileId,
    chatId: chat,
  };
  controllers.register({
    scope,
    close: (): void => undefined,
    perform: (request): Promise<EmbeddedBrowserResult> => {
      seen?.push(request.operation);
      return Promise.resolve({
        snapshot: { ...request.scope, selectedTabId: null, tabs: [] },
        tabId: null,
      });
    },
  });
  return scope;
}

describe('embedded browser routing and actions', () => {
  it('reads the newest viewer even when another device sent the message', async () => {
    viewer(rig.clientId);
    const desktop = viewer('desktop-client');
    const snapshot = await controllers.read(caller(), chat, { view: 'tabs' });
    expect(snapshot.viewerId).toBe(desktop.viewerId);
  });

  it('reads and opens the native preview on the initiating app even after another device registers', async () => {
    const phone = viewer(rig.clientId);
    viewer('desktop-client');
    await nativeBrowserCall(async (actor) => {
      const snapshot = await controllers.read(actor, chat, { view: 'tabs' });
      const result = await controllers.edit(actor, chat, {
        action: { kind: 'open', path: 'workspace/site' },
      });
      expect(snapshot.viewerId).toBe(phone.viewerId);
      expect(result.snapshot.viewerId).toBe(phone.viewerId);
    });
  });

  it('refuses a native preview on another app unless its viewer was requested', async () => {
    const desktop = viewer('desktop-client');
    await nativeBrowserCall(async (actor) => {
      const action = { kind: 'open', path: 'workspace/site' } as const;
      await expect(controllers.edit(actor, chat, { action })).rejects.toThrow(
        'No matching browser is open on a connected device.',
      );
      const result = await controllers.edit(actor, chat, { viewerId: desktop.viewerId, action });
      expect(result.snapshot.viewerId).toBe(desktop.viewerId);
    });
  });

  it('reads a chosen viewer when asked for one', async () => {
    const phone = viewer(rig.clientId);
    viewer('desktop-client');
    const snapshot = await controllers.read(caller(), chat, {
      view: 'tabs',
      viewerId: phone.viewerId,
    });
    expect(snapshot.viewerId).toBe(phone.viewerId);
  });

  it('edits the chosen viewer without a generation handshake', async () => {
    const phone = viewer(rig.clientId);
    const result = await controllers.edit(caller(), chat, {
      viewerId: phone.viewerId,
      action: { kind: 'reload', tabId: randomUUID() },
    });
    expect(result.snapshot.viewerId).toBe(phone.viewerId);
  });

  it('lets a reconnecting viewer replace its earlier socket', async () => {
    const closed: string[] = [];
    const register = (scope: EmbeddedBrowserScope): void => {
      controllers.register({
        scope,
        close: (): void => {
          closed.push(scope.generation);
        },
        perform: (request): Promise<EmbeddedBrowserResult> =>
          Promise.resolve({
            snapshot: { ...request.scope, selectedTabId: null, tabs: [] },
            tabId: null,
          }),
      });
    };
    const first = viewer(rig.clientId);
    const stale = { ...first, generation: randomUUID() };
    register(stale);
    const current = { ...first, generation: randomUUID() };
    register(current);
    const snapshot = await controllers.read(caller(), chat, { view: 'tabs' });
    expect(snapshot.viewerId).toBe(first.viewerId);
    expect(snapshot.generation).toBe(current.generation);
    expect(closed).toEqual([stale.generation]);
  });

  it('refuses another device that claims the same viewer', () => {
    const phone = viewer(rig.clientId);
    expect(() => {
      controllers.register({
        scope: { ...phone, clientId: 'desktop-client', generation: randomUUID() },
        close: (): void => undefined,
        perform: (): Promise<never> => Promise.reject(new Error('unused')),
      });
    }).toThrow('This browser viewer is already registered.');
  });

  it('names the problem in words when no browser is open', async () => {
    await expect(controllers.read(caller(), chat, { view: 'tabs' })).rejects.toThrow(
      'No matching browser is open on a connected device.',
    );
  });

  it('passes a page read and a page action on to the viewer unchanged', async () => {
    const seen: EmbeddedBrowserRequest['operation'][] = [];
    const scope: EmbeddedBrowserScope = {
      viewerId: randomUUID(),
      generation: randomUUID(),
      clientId: rig.clientId,
      profileId: rig.owner.profileId,
      chatId: chat,
    };
    controllers.register({
      scope,
      close: (): void => undefined,
      perform: (request): Promise<EmbeddedBrowserResult> => {
        seen.push(request.operation);
        return Promise.resolve({
          snapshot: { ...request.scope, selectedTabId: null, tabs: [] },
          tabId: null,
        });
      },
    });
    const tabId = randomUUID();
    await controllers.read(caller(), chat, { view: 'page', tabId });
    await controllers.read(caller(), chat, { view: 'page' });
    await controllers.edit(caller(), chat, {
      action: { kind: 'type', tabId, ref: 'e3', text: 'shoes', submit: true },
    });
    expect(seen).toEqual([
      { kind: 'read', view: 'page', tabId },
      { kind: 'read', view: 'page' },
      { kind: 'edit', action: { kind: 'type', tabId, ref: 'e3', text: 'shoes', submit: true } },
    ]);
  });

  it('opens an address given alone and mints its own request id', async () => {
    const seen: EmbeddedBrowserRequest[] = [];
    controllers.register({
      scope: {
        viewerId: randomUUID(),
        generation: randomUUID(),
        clientId: rig.clientId,
        profileId: rig.owner.profileId,
        chatId: chat,
      },
      close: (): void => undefined,
      perform: (request): Promise<EmbeddedBrowserResult> => {
        seen.push(request);
        return Promise.resolve({
          snapshot: { ...request.scope, selectedTabId: null, tabs: [] },
          tabId: null,
        });
      },
    });
    await controllers.edit(caller(), chat, {
      action: { kind: 'open', url: 'https://example.com/' },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.operation).toEqual({
      kind: 'edit',
      action: { kind: 'open', source: { kind: 'public', url: 'https://example.com/' } },
    });
  });

  it('opens a project folder at its index.html and refuses escapes', async () => {
    const seen: EmbeddedBrowserRequest[] = [];
    controllers.register({
      scope: {
        viewerId: randomUUID(),
        generation: randomUUID(),
        clientId: rig.clientId,
        profileId: rig.owner.profileId,
        chatId: chat,
      },
      close: (): void => undefined,
      perform: (request): Promise<EmbeddedBrowserResult> => {
        seen.push(request);
        return Promise.resolve({
          snapshot: { ...request.scope, selectedTabId: null, tabs: [] },
          tabId: null,
        });
      },
    });
    await controllers.edit(caller(), chat, { action: { kind: 'open', path: 'workspace/site' } });
    expect(seen[0]?.operation).toEqual({
      kind: 'edit',
      action: { kind: 'open', source: { kind: 'project', path: '/workspace/site/index.html' } },
    });
    await expect(
      controllers.edit(caller(), chat, { action: { kind: 'open', path: 'workspace/../../etc' } }),
    ).rejects.toThrow('inside this chat’s project');
    await expect(
      controllers.edit(caller(), chat, { action: { kind: 'open', path: 'workspace/missing' } }),
    ).rejects.toThrow('There is no workspace/missing');
    expect(seen).toHaveLength(1);
  });

  it('opens a dev server on the Codex computer when multiple computers are visible', async () => {
    const { store } = rig.opened;
    const target = rig.desk.target;
    if (target.kind !== 'device') throw new Error('The desk is not a device host.');
    store.devices.upsert([
      {
        provider: 'local',
        externalId: 'computer:other',
        parentId: null,
        kind: 'computer',
        name: 'Other computer',
        model: 'smarteverything.computer',
        manufacturer: 'Linux',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    chat = store.aiChats.create({
      profileId: rig.owner.profileId,
      kind: 'chat',
      title: 'Codex preview',
      icon: null,
      parentId: null,
      sourceKey: null,
      engine: {
        kind: 'codex',
        device_id: target.device_id,
        model: 'codex',
        effort: null,
        settings: {},
      },
    }).id;
    const seen: EmbeddedBrowserRequest['operation'][] = [];
    viewer(rig.clientId, seen);
    await nativeBrowserCall((actor) =>
      controllers.edit(actor, chat, { action: { kind: 'open', port: 8765 } }),
    );
    expect(seen).toEqual([
      {
        kind: 'edit',
        action: {
          kind: 'open',
          source: {
            kind: 'server',
            server: {
              computerId: target.device_id,
              port: 8765,
            },
          },
        },
      },
    ]);
  });

  it('acts on the selected tab when no tab is named', async () => {
    const tab = randomUUID();
    const seen: EmbeddedBrowserRequest['operation'][] = [];
    controllers.register({
      scope: {
        viewerId: randomUUID(),
        generation: randomUUID(),
        clientId: rig.clientId,
        profileId: rig.owner.profileId,
        chatId: chat,
      },
      close: (): void => undefined,
      perform: (request): Promise<EmbeddedBrowserResult> => {
        seen.push(request.operation);
        return Promise.resolve({
          snapshot: { ...request.scope, selectedTabId: tab, tabs: [] },
          tabId: tab,
        });
      },
    });
    await controllers.edit(caller(), chat, { action: { kind: 'reload' } });
    expect(seen.at(-1)).toEqual({ kind: 'edit', action: { kind: 'reload', tabId: tab } });
  });

  it('reports the tabs the phone has right now, not a remembered list', async () => {
    const tab = randomUUID();
    let open = true;
    controllers.register({
      scope: {
        viewerId: randomUUID(),
        generation: randomUUID(),
        clientId: rig.clientId,
        profileId: rig.owner.profileId,
        chatId: chat,
      },
      close: (): void => undefined,
      perform: (request): Promise<EmbeddedBrowserResult> =>
        Promise.resolve({
          snapshot: {
            ...request.scope,
            selectedTabId: open ? tab : null,
            tabs: open
              ? [
                  {
                    tabId: tab,
                    title: 'Page',
                    address: 'https://example.com/',
                    source: 'public',
                    state: 'ready',
                    problem: null,
                    back: false,
                    forward: false,
                    loading: false,
                  },
                ]
              : [],
          },
          tabId: null,
        }),
    });
    expect((await controllers.read(caller(), chat, { view: 'tabs' })).tabs).toHaveLength(1);
    open = false;
    expect((await controllers.read(caller(), chat, { view: 'tabs' })).tabs).toEqual([]);
  });

  it('closes a tab the phone already closed and returns the phone snapshot', async () => {
    const seen: EmbeddedBrowserRequest['operation'][] = [];
    controllers.register({
      scope: {
        viewerId: randomUUID(),
        generation: randomUUID(),
        clientId: rig.clientId,
        profileId: rig.owner.profileId,
        chatId: chat,
      },
      close: (): void => undefined,
      perform: (request): Promise<EmbeddedBrowserResult> => {
        seen.push(request.operation);
        return Promise.resolve({
          snapshot: { ...request.scope, selectedTabId: null, tabs: [] },
          tabId: null,
          notice: 'That tab was already closed.',
        });
      },
    });
    const gone = randomUUID();
    const named = await controllers.edit(caller(), chat, {
      action: { kind: 'close', tabId: gone },
    });
    expect(named.snapshot.tabs).toEqual([]);
    expect(named.notice).toBe('That tab was already closed.');
    const unnamed = await controllers.edit(caller(), chat, { action: { kind: 'close' } });
    expect(unnamed.tabId).toBeNull();
    expect(seen.at(-1)).toEqual({ kind: 'read', view: 'tabs' });
  });
});
