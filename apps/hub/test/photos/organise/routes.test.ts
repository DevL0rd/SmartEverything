import type { IncomingHttpHeaders } from 'node:http';
import { LOCKED_TOKEN_HEADER, LOCKED_UNLOCKED, PHOTOS_ENDPOINTS } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Caller } from '../../../src/server/auth';
import { MediaLinks } from '../../../src/server/media-links';
import {
  organiseServices,
  photoOrganiseRoutes,
  type PhotoOrganiseRoutes,
} from '../../../src/photos/organise/routes';
import { testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';

const E = PHOTOS_ENDPOINTS;

let test: TestStore;
let routes: PhotoOrganiseRoutes;
let app: Caller;
let assistant: Caller;
let tablet: Caller;

beforeEach(async () => {
  test = await testStore();
  const { store } = test;
  const profile = store.profiles.create({ name: 'Alice' }).id;
  const client = (name: string, tokenHash: string): Caller => ({
    kind: 'client',
    client: store.clients.create({ name, platform: 'android', role: 'owner', tokenHash }),
    profileId: profile,
  });
  app = client('Phone', 'a'.repeat(64));
  tablet = client('Tablet', 'b'.repeat(64));
  assistant = app.kind === 'client' ? { ...app, via: 'assistant' } : { kind: 'anonymous' };
  routes = photoOrganiseRoutes(
    store,
    organiseServices({
      store,
      write: { change: () => Promise.reject(new Error('The test never moves files.')) },
      links: new MediaLinks(() => new Date()),
      now: () => new Date(),
      timeZone: () => 'UTC',
    }),
  );
});

afterEach(async () => {
  await test.close();
});

function run(
  name: keyof PhotoOrganiseRoutes,
  caller: Caller,
  input: {
    readonly query?: unknown;
    readonly body?: unknown;
    readonly params?: unknown;
    readonly headers?: IncomingHttpHeaders;
  } = {},
): Promise<unknown> {
  return routes[name].run(
    caller,
    {
      params: input.params ?? {},
      query: input.query ?? {},
      body: input.body,
      remote: '127.0.0.1',
      headers: input.headers ?? {},
    },
    testLogger(),
  );
}

describe('the Locked folder routes', () => {
  it('serve every endpoint the domain declares for the organise hub', () => {
    expect(Object.keys(routes).sort()).toEqual(
      [
        'editPhotoMeta',
        'setPhotoDescription',
        'archivePhotos',
        'unarchivePhotos',
        'readPhotoArchived',
        'readArchiveBuckets',
        'readArchivePage',
        'readLockedState',
        'setLockedPin',
        'unlockLockedFolder',
        'lockLockedFolder',
        'readLockedBuckets',
        'readLockedPage',
        'readLockedLinks',
        'moveIntoLockedFolder',
        'moveOutOfLockedFolder',
        'deleteFromLockedFolder',
      ].sort(),
    );
    expect(routes.readLockedPage.endpoint).toBe(E.readLockedPage);
  });

  it('sets the PIN, opens with it and reads pages only with the token of the same client', async () => {
    await expect(run('readLockedState', app)).resolves.toEqual({ configured: false });
    await run('setLockedPin', app, { body: { pin: '2468', currentPin: null } });
    await expect(run('readLockedState', app)).resolves.toEqual({ configured: true });
    await expect(run('readLockedBuckets', app, { query: { filter: 'all' } })).rejects.toMatchObject(
      { code: 'forbidden' },
    );
    await expect(run('unlockLockedFolder', app, { body: { pin: '1111' } })).rejects.toMatchObject({
      code: 'forbidden',
    });
    const opened = LOCKED_UNLOCKED.parse(
      await run('unlockLockedFolder', app, { body: { pin: '2468' } }),
    );
    const headers = { [LOCKED_TOKEN_HEADER]: opened.token };
    const query = { filter: 'all' };
    await expect(run('readLockedBuckets', app, { headers, query })).resolves.toEqual([]);
    await expect(
      run('readLockedPage', app, { headers, query, params: { month: '2026-03' } }),
    ).resolves.toMatchObject({ month: '2026-03', ids: [] });
    await expect(run('readLockedBuckets', tablet, { headers, query })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await run('lockLockedFolder', app);
    await expect(run('readLockedBuckets', app, { headers, query })).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('makes Locked folder links only with the token of the same client', async () => {
    await run('setLockedPin', app, { body: { pin: '2468', currentPin: null } });
    const body = { itemIds: ['0f000000-0000-4000-8000-000000000001'] };
    await expect(run('readLockedLinks', app, { body })).rejects.toMatchObject({
      code: 'forbidden',
    });
    const opened = LOCKED_UNLOCKED.parse(
      await run('unlockLockedFolder', app, { body: { pin: '2468' } }),
    );
    const headers = { [LOCKED_TOKEN_HEADER]: opened.token };
    await expect(run('readLockedLinks', tablet, { body, headers })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(run('readLockedLinks', assistant, { body, headers })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(run('readLockedLinks', app, { body, headers })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('deletes from the Locked folder only with the token of the same client', async () => {
    await run('setLockedPin', app, { body: { pin: '2468', currentPin: null } });
    const body = { itemIds: ['0f000000-0000-4000-8000-000000000001'] };
    await expect(run('deleteFromLockedFolder', app, { body })).rejects.toMatchObject({
      code: 'forbidden',
    });
    const opened = LOCKED_UNLOCKED.parse(
      await run('unlockLockedFolder', app, { body: { pin: '2468' } }),
    );
    const headers = { [LOCKED_TOKEN_HEADER]: opened.token };
    await expect(run('deleteFromLockedFolder', tablet, { body, headers })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(run('deleteFromLockedFolder', app, { body, headers })).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('never lets the AI set the PIN, unlock, lock, read, move out or delete', async () => {
    await run('setLockedPin', app, { body: { pin: '2468', currentPin: null } });
    for (const [name, input] of [
      ['setLockedPin', { body: { pin: '1357', currentPin: '2468' } }],
      ['unlockLockedFolder', { body: { pin: '2468' } }],
      ['lockLockedFolder', {}],
      ['readLockedBuckets', { query: { filter: 'all' } }],
      ['readLockedPage', { query: { filter: 'all' }, params: { month: '2026-03' } }],
      ['readLockedLinks', { body: { itemIds: ['0f000000-0000-4000-8000-000000000001'] } }],
      ['moveOutOfLockedFolder', { body: { itemIds: ['0f000000-0000-4000-8000-000000000001'] } }],
      ['deleteFromLockedFolder', { body: { itemIds: ['0f000000-0000-4000-8000-000000000001'] } }],
    ] as const) {
      await expect(run(name, assistant, input)).rejects.toMatchObject({ code: 'forbidden' });
    }
  });
});
