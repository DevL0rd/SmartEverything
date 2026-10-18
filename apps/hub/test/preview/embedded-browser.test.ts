import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EmbeddedBrowserScope, EmbeddedBrowserResult } from '@smarteverything/domain';
import type { Caller } from '../../src/server/auth';
import { EmbeddedBrowserAuthority } from '../../src/preview/embedded-browser-authority';
import { EmbeddedBrowserControllers } from '../../src/preview/embedded-browser-controllers';
import { ViewerFocus } from '../../src/preview/viewer-focus';
import { harnessRig, type Rig } from '../assistant/harness/support/rig';

let rig: Rig;
let controllers: EmbeddedBrowserControllers;
let chat: string;

beforeEach(async () => {
  rig = await harnessRig();
  chat = rig.newChat({ kind: 'server' }).id;
  controllers = new EmbeddedBrowserControllers(
    rig.opened.store,
    new EmbeddedBrowserAuthority(rig.opened.store, {
      require: (): never => {
        throw new Error('This test publishes nothing.');
      },
    }),
    new ViewerFocus(),
  );
});

afterEach(async () => {
  controllers.stop();
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
    const snapshot = await controllers.read(caller(), chat, {});
    expect(snapshot.viewerId).toBe(desktop.viewerId);
  });

  it('reads a chosen viewer when asked for one', async () => {
    const phone = viewer(rig.clientId);
    viewer('desktop-client');
    const snapshot = await controllers.read(caller(), chat, { viewerId: phone.viewerId });
    expect(snapshot.viewerId).toBe(phone.viewerId);
  });

  it('edits the chosen viewer without a generation handshake', async () => {
    const phone = viewer(rig.clientId);
    const result = await controllers.edit(caller(), chat, {
      requestId: randomUUID(),
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
    const snapshot = await controllers.read(caller(), chat, {});
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
    await expect(controllers.read(caller(), chat, {})).rejects.toThrow(
      'No matching browser is open on a connected device.',
    );
  });
});
