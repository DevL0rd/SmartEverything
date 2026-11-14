import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runUpload } from '../../../apps/app/src/features/drive/upload/transport/run';
import type { UploadTransport } from '../../../apps/app/src/features/drive/upload/transport/types';
import {
  appRequest,
  exchange,
  hash,
  protocolFixture,
  resumeStorage,
  type ProtocolFixture,
} from './fixture';

let fixture: ProtocolFixture;

beforeEach(async () => {
  fixture = await protocolFixture();
});
afterEach(async () => {
  await fixture.close();
});

function transportOf(): UploadTransport {
  return { send: (request) => exchange(fixture.origin, request) };
}

function rememberPhoto(): void {
  fixture.service.checkHashes(fixture.profileId, {
    deviceId: fixture.phoneId,
    assets: [{ localId: 'photo', sha256: hash('photo') }],
  });
}

describe('the actual app upload runner against real tus HTTP', () => {
  it('uploads folder metadata, reports collisions and replaces by item revision', async () => {
    const deps = { transport: transportOf(), storage: resumeStorage(), chunkBytes: 2 };
    const first = await runUpload(appRequest(fixture.folderId, 'first'), deps).outcome;
    expect(first.kind).toBe('done');
    const item = fixture.opened.store.driveItems.byPath(fixture.root.id, 'Uploads/app.jpg');
    if (item === undefined) throw new Error('Missing completed item');
    expect(first).toMatchObject({ itemId: item.id, name: 'app.jpg', renamed: false });
    expect(await runUpload(appRequest(fixture.folderId, 'other'), deps).outcome).toMatchObject({
      kind: 'done',
      name: 'app (2).jpg',
      renamed: true,
    });
    const replacement = {
      ...appRequest(fixture.folderId, 'after'),
      target: { kind: 'item', itemId: item.id, baseRev: item.rev } as const,
    };
    expect(await runUpload(replacement, deps).outcome).toMatchObject({
      kind: 'done',
      itemId: item.id,
    });
    expect(
      await readFile(join(fixture.opened.directory, 'library', 'Uploads', 'app.jpg'), 'utf8'),
    ).toBe('after');
    expect(fixture.opened.store.driveVersions.findRev(item.id, item.rev)).toBeDefined();
  });

  it('rejects equal-size bytes that changed since the phone hash without verifying its backup', async () => {
    rememberPhoto();
    const changed = {
      ...appRequest(fixture.folderId, 'photo'),
      source: new Blob(['other'], { type: 'image/jpeg' }),
    };
    const outcome = await runUpload(changed, {
      transport: transportOf(),
      storage: resumeStorage(),
      chunkBytes: 2,
    }).outcome;
    expect(outcome).toMatchObject({ kind: 'failed', failure: { kind: 'rejected', status: 460 } });
    expect(
      fixture.opened.store.driveItems.byPath(fixture.root.id, 'Uploads/app.jpg'),
    ).toBeUndefined();
    expect(fixture.service.state(fixture.profileId)[0]).toMatchObject({
      backedUp: 0,
      uploading: 1,
    });
    expect(fixture.opened.store.driveIntents.forRoot(fixture.root.id)).toEqual([]);
  });

  it('resumes a lost final response by completed HEAD without reuploading bytes', async () => {
    let loseReply = true;
    let sent = 0;
    const transport: UploadTransport = {
      send: async (request) => {
        const answer = await exchange(fixture.origin, request);
        sent += request.body?.size ?? 0;
        if (
          request.method === 'PATCH' &&
          answer.headers['upload-item-id'] !== undefined &&
          loseReply
        ) {
          loseReply = false;
          throw new Error('Isolated lost final reply');
        }
        return answer;
      },
    };
    const deps = { transport, storage: resumeStorage(), chunkBytes: 2 };
    expect(await runUpload(appRequest(fixture.folderId, 'photo'), deps).outcome).toMatchObject({
      kind: 'failed',
    });
    expect(sent).toBe(5);
    expect(await runUpload(appRequest(fixture.folderId, 'photo'), deps).outcome).toMatchObject({
      kind: 'done',
      name: 'app.jpg',
    });
    expect(sent).toBe(5);
    expect(
      await readFile(join(fixture.opened.directory, 'library', 'Uploads', 'app.jpg'), 'utf8'),
    ).toBe('photo');
  });

  it('backs up once and transfers no bytes for the second hash-only backup', async () => {
    rememberPhoto();
    let sent = 0;
    const transport: UploadTransport = {
      send: async (request) => {
        sent += request.body?.size ?? 0;
        return exchange(fixture.origin, request);
      },
    };
    const outcome = await runUpload(appRequest(fixture.folderId, 'photo'), {
      transport,
      storage: resumeStorage(),
      chunkBytes: 2,
    }).outcome;
    expect(outcome.kind).toBe('done');
    expect(sent).toBe(5);
    expect(fixture.service.state(fixture.profileId)[0]).toMatchObject({
      backedUp: 1,
      uploading: 0,
    });
    const repeated = fixture.service.checkHashes(fixture.profileId, {
      deviceId: fixture.phoneId,
      assets: [{ localId: 'photo', sha256: hash('photo') }],
    });
    expect(repeated.missing).toEqual([]);
    expect(repeated.have).toHaveLength(1);
    expect(sent).toBe(5);
  });

  it('rolls back item, receipt, backup verification and notices when settlement fails', async () => {
    await fixture.close();
    fixture = await protocolFixture((item, service): void => {
      service.settleItem(item);
      throw new Error('Isolated settlement failure');
    });
    rememberPhoto();
    const notices: unknown[] = [];
    const unsubscribe = fixture.opened.store.feed.subscribeNotices((notice) => {
      notices.push(notice);
    });
    const outcome = await runUpload(appRequest(fixture.folderId, 'photo'), {
      transport: transportOf(),
      storage: resumeStorage(),
      chunkBytes: 2,
    }).outcome;
    expect(outcome.kind).toBe('failed');
    expect(
      fixture.opened.store.driveItems.byPath(fixture.root.id, 'Uploads/app.jpg'),
    ).toBeUndefined();
    expect(fixture.service.state(fixture.profileId)[0]).toMatchObject({
      backedUp: 0,
      uploading: 1,
    });
    expect(notices).toEqual([]);
    expect(fixture.opened.store.driveIntents.forRoot(fixture.root.id)).toHaveLength(1);
    expect(
      await readFile(join(fixture.opened.directory, 'library', 'Uploads', 'app.jpg'), 'utf8'),
    ).toBe('photo');
    const receipt = fixture.opened.store.context.sql.get(
      z.strictObject({ total: z.number() }),
      'select count(*) as total from drive_upload_results',
    );
    expect(receipt?.total).toBe(0);
    unsubscribe();
  });
});
