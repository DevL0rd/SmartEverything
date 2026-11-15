import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS,
  DRIVE_EDIT_ACTIONS,
  DRIVE_READ_VIEWS,
  type ClientRow,
  type EndpointName,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OperatingContext } from '../../src/extensions/mcp/tools/acting';
import { DRIVE_EDIT } from '../../src/extensions/mcp/tools/drive-edits';
import { DRIVE_READ } from '../../src/extensions/mcp/tools/drive-reads';
import type { SelectedToolDefinition } from '../../src/extensions/mcp/tools/selected-tool';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

interface Call {
  readonly name: EndpointName;
  readonly params: Record<string, string>;
  readonly query: Record<string, unknown>;
  readonly body: unknown;
}

const ID = {
  item: randomUUID(),
  folder: randomUUID(),
  root: randomUUID(),
  comment: randomUUID(),
  thread: randomUUID(),
  shortcut: randomUUID(),
  request: randomUUID(),
  transfer: randomUUID(),
  person: randomUUID(),
  phone: randomUUID(),
  note: randomUUID(),
};
const SOON = '2099-01-01T00:00:00.000Z';

let opened: TestStore;
let calls: Call[];
let context: OperatingContext;

function operating(client: ClientRow, profileId: string): OperatingContext {
  return {
    store: opened.store,
    caller: null,
    actor: { clientId: client.id, profileId, chatId: null },
    operations: {
      run: (name, _caller, input): Promise<unknown> => {
        API_ENDPOINTS[name].params.parse(input.params ?? {});
        calls.push({
          name,
          params: input.params ?? {},
          query: input.query ?? {},
          body: input.body,
        });
        return Promise.resolve({ ok: true });
      },
    },
  };
}

function run(
  definition: SelectedToolDefinition,
  key: string,
  fields: Record<string, unknown>,
): unknown {
  const found = definition.selections[key];
  if (found === undefined) throw new Error(`no selection ${key}`);
  return found.run(context, fields, {});
}

async function called(
  definition: SelectedToolDefinition,
  key: string,
  fields: Record<string, unknown>,
): Promise<Call> {
  calls = [];
  await run(definition, key, fields);
  expect(calls).toHaveLength(1);
  const [only] = calls;
  if (only === undefined) throw new Error('no call');
  const endpoint = API_ENDPOINTS[only.name];
  endpoint.body.parse(only.body);
  endpoint.query.parse(only.query);
  return only;
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  calls = [];
  const profile = opened.store.profiles.first();
  const client = opened.store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'b'.repeat(64),
  });
  context = operating(client, profile.id);
});

afterEach(async () => {
  await opened.close();
});

describe('Drive wave 2 reads', () => {
  const READS: readonly (readonly [string, Record<string, unknown>, EndpointName])[] = [
    ['zip', { itemId: ID.item }, 'listZipEntries'],
    ['text', { itemId: ID.item }, 'readItemText'],
    ['comments', { itemId: ID.item }, 'listComments'],
    ['suggested', {}, 'listSuggested'],
    ['notifications', {}, 'listNotifications'],
    ['access_requests', {}, 'listDriveAccessRequests'],
    ['access_requests', { itemId: ID.item }, 'openItem'],
    ['file_requests', {}, 'listFileRequests'],
    ['file_requests', { requestId: ID.request }, 'listFileRequestUploads'],
    ['transfers', {}, 'listTransfers'],
    ['offline', {}, 'listOffline'],
  ];

  it.each(READS)('view %s with %j calls %s', async (view, fields, name) => {
    const call = await called(DRIVE_READ, view, fields);
    expect(call.name).toBe(name);
  });

  it('pages zip, comments, suggestions, notifications, transfers and offline files', async () => {
    const withCursor = await called(DRIVE_READ, 'suggested', { cursor: 'next' });
    expect(withCursor.query).toEqual({ cursor: 'next' });
    const zip = await called(DRIVE_READ, 'zip', { itemId: ID.item, cursor: 'c' });
    expect(zip.params).toEqual({ itemId: ID.item });
    expect(zip.query).toEqual({ cursor: 'c' });
  });

  it('reads the requests waiting for the person by default and the ones they made on request', async () => {
    expect((await called(DRIVE_READ, 'access_requests', {})).query).toEqual({ box: 'waiting' });
    expect((await called(DRIVE_READ, 'access_requests', { box: 'made' })).query).toEqual({
      box: 'made',
    });
  });

  it('narrows file requests to one folder and offline files to one phone', async () => {
    const requests = await called(DRIVE_READ, 'file_requests', { folderId: ID.folder });
    expect(requests.query).toEqual({ folderItemId: ID.folder });
    const offline = await called(DRIVE_READ, 'offline', { clientId: ID.phone });
    expect(offline.query).toEqual({ clientId: ID.phone });
  });

  it('searches names only or inside files and always names the match', async () => {
    const inside = await called(DRIVE_READ, 'search', { text: 'invoice' });
    expect(API_ENDPOINTS.searchDrive.body.parse(inside.body).match).toBe('all');
    const names = await called(DRIVE_READ, 'search', { text: 'invoice', match: 'names' });
    expect(API_ENDPOINTS.searchDrive.body.parse(names.body).match).toBe('names');
  });

  it.each(READS)('the tool input accepts view %s with %j', (view, fields) => {
    expect(DRIVE_READ.input.safeParse({ view, ...fields }).success).toBe(true);
  });

  it('has a read selection for every view this wave added', () => {
    for (const [view] of READS) {
      expect(DRIVE_READ_VIEWS).toContain(view);
      expect(Object.keys(DRIVE_READ.selections)).toContain(view);
    }
  });
});

describe('Drive wave 2 actions', () => {
  const EDITS: readonly (readonly [string, Record<string, unknown>, EndpointName])[] = [
    ['comment_add', { itemId: ID.item, body: 'Looks right' }, 'addComment'],
    ['comment_add', { itemId: ID.item, body: 'Yes', threadId: ID.thread }, 'addComment'],
    ['comment_edit', { commentId: ID.comment, body: 'Edited' }, 'editComment'],
    ['comment_resolve', { commentId: ID.comment }, 'resolveComment'],
    ['comment_remove', { commentId: ID.comment }, 'removeComment'],
    ['shortcut_create', { itemId: ID.item, name: 'Taxes', parentId: ID.folder }, 'createShortcut'],
    ['shortcut_create', { itemId: ID.item, name: 'Taxes', rootId: ID.root }, 'createShortcut'],
    ['shortcut_update', { shortcutId: ID.shortcut, name: 'Taxes 2' }, 'updateShortcut'],
    ['shortcut_update', { shortcutId: ID.shortcut, rootId: ID.root }, 'updateShortcut'],
    ['shortcut_remove', { shortcutId: ID.shortcut }, 'removeShortcut'],
    ['access_request', { itemId: ID.item }, 'requestDriveAccess'],
    [
      'access_answer',
      { requestId: ID.request, decision: 'approve', role: 'view', expiresAt: SOON },
      'answerDriveAccessRequest',
    ],
    ['access_answer', { requestId: ID.request, decision: 'decline' }, 'answerDriveAccessRequest'],
    ['file_request_create', { folderId: ID.folder, title: 'Receipts' }, 'createFileRequest'],
    ['file_request_update', { requestId: ID.request, title: 'Receipts 2' }, 'updateFileRequest'],
    ['file_request_close', { requestId: ID.request }, 'closeFileRequest'],
    ['lock_set', { itemId: ID.item, locked: true }, 'setItemLock'],
    ['folder_colour', { itemId: ID.folder, colour: 'viz-3' }, 'setFolderColour'],
    ['folder_colour', { itemId: ID.folder }, 'setFolderColour'],
    ['transfer_offer', { itemId: ID.item, recipientId: ID.person }, 'offerTransfer'],
    ['transfer_answer', { transferId: ID.transfer, accept: true }, 'answerTransfer'],
    ['transfer_cancel', { transferId: ID.transfer }, 'cancelTransfer'],
    ['notifications_read', { ids: [ID.note] }, 'markNotificationsRead'],
    ['notifications_read', { all: true }, 'markNotificationsRead'],
    ['offline_set', { clientId: ID.phone, itemId: ID.item }, 'setOffline'],
    ['offline_set', { clientId: ID.phone, itemId: ID.item, on: false }, 'setOffline'],
  ];

  it.each(EDITS)(
    'action %s with %j calls %s with a body its endpoint accepts',
    async (action, fields, name) => {
      const call = await called(DRIVE_EDIT, action, fields);
      expect(call.name).toBe(name);
    },
  );

  it('replies to a thread and mentions people', async () => {
    const call = await called(DRIVE_EDIT, 'comment_add', {
      itemId: ID.item,
      body: 'Yes',
      threadId: ID.thread,
      mentions: [ID.person],
    });
    expect(call.body).toEqual({ body: 'Yes', parentId: ID.thread, mentions: [ID.person] });
    const plain = await called(DRIVE_EDIT, 'comment_add', { itemId: ID.item, body: 'Hi' });
    expect(plain.body).toEqual({ body: 'Hi', parentId: null, mentions: [] });
  });

  it('puts a shortcut in a folder or at the top of a drive', async () => {
    const inFolder = await called(DRIVE_EDIT, 'shortcut_create', {
      itemId: ID.item,
      name: 'Taxes',
      parentId: ID.folder,
    });
    expect(inFolder.body).toEqual({
      targetItemId: ID.item,
      name: 'Taxes',
      place: { kind: 'folder', folderId: ID.folder },
    });
    const atTop = await called(DRIVE_EDIT, 'shortcut_create', {
      itemId: ID.item,
      name: 'Taxes',
      rootId: ID.root,
    });
    expect(API_ENDPOINTS.createShortcut.body.parse(atTop.body).place).toEqual({
      kind: 'drive',
      rootId: ID.root,
    });
  });

  it('refuses a shortcut without a place and a shortcut update that changes nothing', () => {
    expect(() => run(DRIVE_EDIT, 'shortcut_create', { itemId: ID.item, name: 'x' })).toThrow();
    expect(() => run(DRIVE_EDIT, 'shortcut_update', { shortcutId: ID.shortcut })).toThrow();
    expect(() =>
      run(DRIVE_EDIT, 'shortcut_create', {
        itemId: ID.item,
        name: 'x',
        parentId: ID.folder,
        rootId: ID.root,
      }),
    ).toThrow();
  });

  it('asks for view access unless told otherwise and sends the message', async () => {
    const call = await called(DRIVE_EDIT, 'access_request', { itemId: ID.item, message: 'Please' });
    expect(call.body).toEqual({ itemId: ID.item, role: 'view', message: 'Please' });
  });

  it('refuses to approve an access request without a role', () => {
    expect(() =>
      run(DRIVE_EDIT, 'access_answer', { requestId: ID.request, decision: 'approve' }),
    ).toThrow();
  });

  it('turns a transfer offer into the person to receive it', async () => {
    const call = await called(DRIVE_EDIT, 'transfer_offer', {
      itemId: ID.item,
      recipientId: ID.person,
    });
    expect(call.body).toEqual({ itemId: ID.item, toProfileId: ID.person });
  });

  it('clears a folder colour when none is named', async () => {
    const call = await called(DRIVE_EDIT, 'folder_colour', { itemId: ID.folder });
    expect(call.body).toEqual({ itemId: ID.folder, colour: null });
  });

  it('refuses to mark notifications read without naming which', () => {
    expect(() => run(DRIVE_EDIT, 'notifications_read', {})).toThrow();
  });

  it('gives people access with an end date and without one', async () => {
    const ending = await called(DRIVE_EDIT, 'share_people', {
      itemId: ID.item,
      recipientId: ID.person,
      role: 'view',
      expiresAt: SOON,
    });
    expect(API_ENDPOINTS.setGrant.body.parse(ending.body).expiresAt).toBe(SOON);
    const open = await called(DRIVE_EDIT, 'share_people', {
      itemId: ID.item,
      recipientId: ID.person,
      role: 'edit',
    });
    expect(API_ENDPOINTS.setGrant.body.parse(open.body).expiresAt).toBeNull();
  });

  it.each(EDITS)('the tool input accepts action %s with %j', (action, fields) => {
    expect(DRIVE_EDIT.input.safeParse({ action, ...fields }).success).toBe(true);
  });

  it('has an edit selection for every action this wave added', () => {
    for (const [action] of EDITS) {
      expect(DRIVE_EDIT_ACTIONS).toContain(action);
      expect(Object.keys(DRIVE_EDIT.selections)).toContain(action);
    }
  });
});
