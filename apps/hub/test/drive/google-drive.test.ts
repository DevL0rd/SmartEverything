import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GoogleImportError } from '../../src/drive/google/errors';
import {
  SCOPE_DRIVE_READONLY,
  SCOPE_PHOTOS_PICKER,
  GOOGLE_APPS_PREFIX,
} from '../../src/drive/google/scopes';
import { TMP_DIRECTORY } from '../../src/drive/intents';
import { bytesOf } from '../fakes/google-drive';
import { REDIRECT, openRig, type Rig } from '../fakes/google-drive/rig';
import { captureLogs } from '../support/logs';

const DRIVE = { drive: true, photos: false } as const;
const PHOTOS = { drive: false, photos: true } as const;
const ATOP = 'my-drive-root';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let rig: Rig;

beforeEach(() => {
  captureLogs();
});

afterEach(async () => {
  await rig.close();
});

async function text(...segments: string[]): Promise<string> {
  return readFile(join(rig.rootPath, ...segments), 'utf8');
}

function record(importId: string): NonNullable<ReturnType<Rig['ledger']['find']>> {
  const found = rig.ledger.find(importId);
  if (found === undefined) {
    throw new Error('missing record');
  }
  return found;
}

function fillDrive(): void {
  const trips = rig.fake.addFolder('Trips', ATOP);
  const year = rig.fake.addFolder('2025', trips);
  rig.fake.addFile(
    { name: 'ticket.txt', parentId: year, modifiedTime: '2025-06-01T10:00:00.000Z' },
    'ticket',
  );
  rig.fake.addFile({ name: 'notes.txt', parentId: trips }, 'notes');
  rig.fake.addFile({ name: 'readme.txt', parentId: ATOP }, 'readme');
  rig.fake.addFile({ name: 'a/b.txt', parentId: ATOP }, 'slash');
  rig.fake.addDocument(
    { name: 'Plan', parentId: trips },
    'document',
    new Map([[DOCX, 'docx bytes']]),
  );
  rig.fake.addDocument({ name: 'Shortcut', parentId: ATOP }, 'shortcut', new Map());
}

describe('consent', () => {
  it('asks for read-only Drive and Photos access with PKCE and nothing else', async () => {
    rig = await openRig();
    const both = new URL(rig.start({ drive: true, photos: true }).authorizationUrl);
    expect(both.searchParams.get('scope')).toBe(`${SCOPE_DRIVE_READONLY} ${SCOPE_PHOTOS_PICKER}`);
    expect(both.searchParams.get('code_challenge_method')).toBe('S256');
    expect(both.searchParams.get('response_type')).toBe('code');
    expect(both.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(SCOPE_DRIVE_READONLY.endsWith('.readonly')).toBe(true);
    expect(SCOPE_PHOTOS_PICKER.endsWith('.readonly')).toBe(true);
  });

  it('refuses nothing selected, no library folder and a second import at once', async () => {
    rig = await openRig();
    expect(() => rig.start({ drive: false, photos: false })).toThrow(
      expect.objectContaining({ failure: 'nothing_selected' }),
    );
    rig.start(DRIVE);
    expect(() => rig.start(DRIVE)).toThrow(expect.objectContaining({ failure: 'already_running' }));
    await rig.close();
    rig = await openRig({ library: false });
    expect(() => rig.start(DRIVE)).toThrow(
      expect.objectContaining({ failure: 'no_library_folder' }),
    );
  });

  it('refuses a wrong state, a different redirect and a code used twice', async () => {
    rig = await openRig();
    const started = rig.start(DRIVE);
    const granted = rig.consent(started.authorizationUrl);
    const complete = (state: string, redirectUri: string): Promise<unknown> =>
      rig.service.complete({ profileId: rig.profileId, state, code: granted.code, redirectUri });
    await expect(complete('forged', REDIRECT)).rejects.toMatchObject({ failure: 'state_mismatch' });
    await expect(complete(granted.state, 'http://127.0.0.1:1/other')).rejects.toMatchObject({
      failure: 'redirect_mismatch',
    });
    await complete(granted.state, REDIRECT);
    await rig.service.settled(started.importId);
    await expect(complete(granted.state, REDIRECT)).rejects.toBeInstanceOf(GoogleImportError);
  });

  it('fails the import and revokes the token when a scope was not granted', async () => {
    rig = await openRig();
    const started = rig.start({ drive: true, photos: true });
    const granted = rig.consent(started.authorizationUrl, [SCOPE_DRIVE_READONLY]);
    await expect(
      rig.service.complete({ profileId: rig.profileId, ...granted, redirectUri: REDIRECT }),
    ).rejects.toMatchObject({ failure: 'consent_refused' });
    expect(record(started.importId)).toMatchObject({ state: 'failed', failure: 'consent_refused' });
    expect(rig.fake.oauth.revoked.size).toBe(1);
    expect(rig.service.holdsToken(started.importId)).toBe(false);
  });
});

describe('copying Drive', () => {
  it('keeps the folder structure, times and names, pages through the listing and skips what cannot be copied', async () => {
    rig = await openRig();
    fillDrive();
    const importId = await rig.run(DRIVE);
    expect(await text('Google Drive', 'Trips', '2025', 'ticket.txt')).toBe('ticket');
    expect(await text('Google Drive', 'Trips', 'notes.txt')).toBe('notes');
    expect(await text('Google Drive', 'readme.txt')).toBe('readme');
    expect(await text('Google Drive', 'a-b.txt')).toBe('slash');
    expect(await text('Google Drive', 'Trips', 'Plan.docx')).toBe('docx bytes');
    const written = await stat(join(rig.rootPath, 'Google Drive', 'Trips', '2025', 'ticket.txt'));
    expect(written.mtime.toISOString()).toBe('2025-06-01T10:00:00.000Z');
    const item = rig.store.store.driveItems.byPath(
      rig.rootId,
      'Google Drive/Trips/2025/ticket.txt',
    );
    expect(item?.addedByProfileId).toBe(rig.profileId);
    expect(record(importId)).toMatchObject({
      state: 'finished',
      failure: null,
      driveCursor: null,
      drive: { listed: 6, copied: 5, duplicates: 0, skipped: 1, failed: 0 },
    });
    const pages = rig.fake.requests.filter(
      (request) =>
        request.path === '/drive/v3/files' && request.query['q']?.includes('!=') === true,
    );
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.some((request) => request.query['pageToken'] !== undefined)).toBe(true);
    expect(rig.fake.mediaRequests().every((request) => request.status === 200)).toBe(true);
    expect(rig.fake.requests.some((request) => request.path.includes(GOOGLE_APPS_PREFIX))).toBe(
      false,
    );
  });

  it('leaves nothing in the temporary folder and never writes to Google', async () => {
    rig = await openRig();
    fillDrive();
    await rig.run(DRIVE);
    expect(await readdir(join(rig.rootPath, TMP_DIRECTORY))).toEqual([]);
    expect(
      rig.fake.requests.filter(
        (request) => request.method !== 'GET' && request.host !== 'oauth2.googleapis.com',
      ),
    ).toEqual([]);
  });

  it('skips duplicates by hash, also in a later import', async () => {
    rig = await openRig();
    const one = rig.fake.addFolder('One', ATOP);
    const two = rig.fake.addFolder('Two', ATOP);
    rig.fake.addFile({ name: 'same.txt', parentId: one }, 'identical');
    rig.fake.addFile({ name: 'copy.txt', parentId: two }, 'identical');
    rig.fake.addFile({ name: 'other.txt', parentId: two }, 'different');
    const first = await rig.run(DRIVE);
    expect(record(first).drive).toMatchObject({ copied: 2, duplicates: 1 });
    expect(await readdir(join(rig.rootPath, 'Google Drive', 'Two'))).toEqual(['other.txt']);
    const second = await rig.run(DRIVE);
    expect(record(second).drive).toMatchObject({ listed: 3, copied: 0, duplicates: 3 });
  });

  it('gives a free name when the same name holds different bytes', async () => {
    rig = await openRig();
    const folder = rig.fake.addFolder('Docs', ATOP);
    rig.fake.addFile({ name: 'a.txt', parentId: folder }, 'first');
    rig.fake.addFile({ name: 'a.txt', parentId: folder }, 'second');
    await rig.run(DRIVE);
    expect(await text('Google Drive', 'Docs', 'a.txt')).toBe('first');
    expect(await text('Google Drive', 'Docs', 'a (2).txt')).toBe('second');
  });

  it('renews the access token when Google refuses it and keeps going', async () => {
    rig = await openRig();
    fillDrive();
    rig.fake.expireAccessAfterMedia(2);
    const importId = await rig.run(DRIVE);
    expect(rig.fake.oauth.refreshes).toBe(1);
    expect(record(importId)).toMatchObject({ state: 'finished', drive: { copied: 5 } });
  });

  it('stops as interrupted when the space limit is reached and leaves no partial file', async () => {
    rig = await openRig({ quota: 4 });
    rig.fake.addFile({ name: 'big.txt', parentId: ATOP }, 'more than four bytes');
    const importId = await rig.run(DRIVE);
    expect(record(importId)).toMatchObject({ state: 'interrupted', failure: 'storage_full' });
    expect(
      rig.store.store.driveItems.byPath(rig.rootId, 'Google Drive/big.txt', null),
    ).toBeUndefined();
    expect(await readdir(join(rig.rootPath, TMP_DIRECTORY))).toEqual([]);
  });
});

describe('interruption and resume', () => {
  it('stops when Google fails, discards the token and resumes with a new consent without copying again', async () => {
    rig = await openRig();
    rig.fake.setPageSize(2);
    const names = ['a', 'b', 'c', 'd', 'e'];
    for (const name of names) {
      rig.fake.addFile({ name: `${name}.txt`, parentId: ATOP }, `body ${name}`);
    }
    rig.fake.failMediaAfter(2, 503);
    const importId = await rig.run(DRIVE);
    expect(record(importId)).toMatchObject({
      state: 'interrupted',
      failure: 'google_unreachable',
      driveCursor: '2',
      drive: { copied: 2 },
    });
    expect(rig.service.holdsToken(importId)).toBe(false);
    expect(rig.fake.oauth.revoked.size).toBe(1);
    rig.fake.heal();
    const mediaBefore = rig.fake.mediaRequests().length;
    const resumed = rig.service.resume({
      profileId: rig.profileId,
      importId,
      redirectUri: REDIRECT,
    });
    expect(record(importId).state).toBe('awaiting_consent');
    expect(rig.service.holdsToken(importId)).toBe(false);
    const granted = rig.consent(resumed.authorizationUrl);
    await rig.service.complete({ profileId: rig.profileId, ...granted, redirectUri: REDIRECT });
    await rig.service.settled(importId);
    expect(record(importId)).toMatchObject({ state: 'finished', drive: { copied: 5 } });
    expect(rig.fake.mediaRequests().length - mediaBefore).toBe(3);
    expect(rig.fake.oauth.issued.length).toBe(2);
    expect((await readdir(join(rig.rootPath, 'Google Drive'))).sort()).toEqual(
      names.map((name) => `${name}.txt`),
    );
  });

  it("refuses to resume an import that is not interrupted and one that is not the caller's", async () => {
    rig = await openRig();
    rig.fake.addFile({ name: 'a.txt', parentId: ATOP }, 'a');
    const importId = await rig.run(DRIVE);
    expect(() =>
      rig.service.resume({ profileId: rig.profileId, importId, redirectUri: REDIRECT }),
    ).toThrow(expect.objectContaining({ failure: 'not_resumable' }));
    expect(() =>
      rig.service.resume({
        profileId: '00000000-0000-4000-8000-000000000000',
        importId,
        redirectUri: REDIRECT,
      }),
    ).toThrow(expect.objectContaining({ failure: 'not_found' }));
  });

  it('marks imports left running by a restart as interrupted', async () => {
    rig = await openRig();
    const started = rig.start(DRIVE);
    expect(record(started.importId).state).toBe('awaiting_consent');
    rig.service.recoverAtStart();
    expect(record(started.importId).state).toBe('interrupted');
  });
});

describe('the token', () => {
  it('is discarded and revoked when the import finishes and is never stored', async () => {
    rig = await openRig();
    rig.fake.addFile({ name: 'a.txt', parentId: ATOP }, 'a');
    const importId = await rig.run(DRIVE);
    expect(rig.service.holdsToken(importId)).toBe(false);
    const stored = rig.ledger.stored();
    for (const token of [...rig.fake.oauth.issued, ...rig.fake.oauth.revoked]) {
      expect(stored).not.toContain(token);
    }
    expect(rig.fake.oauth.revoked.size).toBe(1);
  });

  it('is discarded and revoked when the import is cancelled while it waits for a pick', async () => {
    rig = await openRig();
    const started = rig.start(PHOTOS);
    const granted = rig.consent(started.authorizationUrl);
    let cancelling: Promise<unknown> = Promise.resolve();
    rig.waits.onWait = (): void => {
      cancelling = rig.service.cancel(rig.profileId, started.importId);
    };
    await rig.service.complete({ profileId: rig.profileId, ...granted, redirectUri: REDIRECT });
    await rig.service.settled(started.importId);
    await cancelling;
    expect(record(started.importId)).toMatchObject({ state: 'cancelled', failure: null });
    expect(rig.service.holdsToken(started.importId)).toBe(false);
    expect(rig.fake.oauth.revoked.size).toBe(1);
    expect(rig.fake.openSessions()).toBe(0);
  });

  it('is never made when the import is cancelled before consent', async () => {
    rig = await openRig();
    const started = rig.start(DRIVE);
    const granted = rig.consent(started.authorizationUrl);
    const cancelled = await rig.service.cancel(rig.profileId, started.importId);
    expect(cancelled.state).toBe('cancelled');
    await expect(
      rig.service.complete({ profileId: rig.profileId, ...granted, redirectUri: REDIRECT }),
    ).rejects.toMatchObject({ failure: 'state_mismatch' });
    expect(rig.fake.oauth.issued).toEqual([]);
  });
});

describe('copying Photos', () => {
  const spec = (
    id: string,
    extra: object = {},
  ): Parameters<Rig['fake']['pickLater']>[0][number] => ({
    id,
    filename: `${id}.jpg`,
    mimeType: 'image/jpeg',
    createTime: '2025-03-04T05:06:07.000Z',
    type: 'PHOTO',
    content: bytesOf(`pixels ${id}`),
    ...extra,
  });

  it('shows the picker, copies what the person picked by capture month and names the limits', async () => {
    rig = await openRig();
    rig.fake.pickLater([
      spec('p1'),
      spec('p2', { createTime: '2024-12-31T23:00:00.000Z' }),
      spec('v1', {
        type: 'VIDEO',
        mimeType: 'video/mp4',
        filename: 'v1.mp4',
        processing: 'PROCESSING',
      }),
    ]);
    rig.waits.onWait = (): void => {
      if (rig.waits.calls === 2) {
        rig.fake.choose();
      }
    };
    const importId = await rig.run(PHOTOS);
    expect(await text('Google Photos', '2025', '2025-03', 'p1.jpg')).toBe('pixels p1');
    expect(await text('Google Photos', '2024', '2024-12', 'p2.jpg')).toBe('pixels p2');
    const taken = await stat(join(rig.rootPath, 'Google Photos', '2025', '2025-03', 'p1.jpg'));
    expect(taken.mtime.toISOString()).toBe('2025-03-04T05:06:07.000Z');
    expect(record(importId)).toMatchObject({
      state: 'finished',
      photos: { listed: 3, copied: 2, skipped: 1, failed: 0 },
    });
    const announced = rig.reports.find((progress) => progress.pickerUri !== null);
    expect(announced?.pickerUri).toBe('https://photos.google.com/picker/picker-1');
    expect(announced?.limits).toEqual([
      'photos_only_picked_items',
      'photos_no_location',
      'photos_no_description',
    ]);
    expect(rig.fake.openSessions()).toBe(0);
  });

  it('copies Drive and Photos in one run under one consent', async () => {
    rig = await openRig();
    rig.fake.addFile({ name: 'a.txt', parentId: ATOP }, 'a');
    rig.fake.pickLater([spec('p1')]);
    rig.waits.onWait = (): void => {
      rig.fake.choose();
    };
    const importId = await rig.run({ drive: true, photos: true });
    expect(record(importId)).toMatchObject({
      state: 'finished',
      drive: { copied: 1 },
      photos: { copied: 1 },
    });
    expect(rig.fake.oauth.issued.length).toBe(1);
  });

  it('reports a Drive-only import with no photo limits', async () => {
    rig = await openRig();
    rig.fake.addFile({ name: 'a.txt', parentId: ATOP }, 'a');
    await rig.run(DRIVE);
    expect(rig.service.status(rig.profileId)?.limits).toEqual([]);
  });
});
