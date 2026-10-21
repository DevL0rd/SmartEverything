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

function viewer(clientId: string): EmbeddedBrowserScope {
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
    perform: (request): Promise<EmbeddedBrowserResult> =>
      Promise.resolve({
        snapshot: { ...request.scope, selectedTabId: null, tabs: [] },
        tabId: null,
      }),
  });
  return scope;
}

describe('the AI drives the browser of the most recently focused device', () => {
  it('reads the newest viewer even when another device sent the message', async () => {
    viewer(rig.clientId);
    const desktop = viewer('desktop-client');
    const snapshot = await controllers.read(caller(), chat, { view: 'tabs' });
    expect(snapshot.viewerId).toBe(desktop.viewerId);
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
