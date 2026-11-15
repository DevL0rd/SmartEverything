import { createHash, randomBytes, randomUUID, scrypt } from 'node:crypto';
import { buildPath, MEDIA_PATHS } from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../apps/hub/src/store/store.ts';
import { DAY_MS } from './clock.ts';
import type { Counted, FilesContext } from './context.ts';

const ROW = z.object({ id: z.string() });
const TOKEN_BYTES = 32;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export const SHARE_PASSWORD = 'test-hub-share';

export interface DriveLinks {
  readonly counts: Counted;
  readonly paths: readonly string[];
}

function itemId(store: Store, relPath: string, scope: 'home' | 'person'): string {
  const row = store.database
    .prepare(
      `select i.id as id from drive_items i join drive_roots r on r.id = i.root_id
       where i.rel_path = $path and r.scope = $scope order by r.created_at limit 1`,
    )
    .get({ path: relPath, scope });
  if (row === undefined) throw new Error(`The seeded item ${relPath} is not indexed.`);
  return ROW.parse(row).id;
}

function newToken(): { readonly token: string; readonly hash: string } {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: createHash('sha256').update(token).digest('hex') };
}

function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, (failure, key) => {
      if (failure === null) resolve(`${salt.toString('hex')}:${key.toString('hex')}`);
      else reject(failure);
    });
  });
}

export async function seedDriveShares(store: Store, context: FilesContext): Promise<DriveLinks> {
  const owner = context.people[0];
  if (owner === undefined) throw new Error('The household has no owner.');
  const now = context.anchor.now;
  const future = new Date(now.getTime() + 30 * DAY_MS).toISOString();
  const view = newToken();
  const download = newToken();
  const request = newToken();
  store.driveShares.insert({
    id: randomUUID(),
    itemId: itemId(store, 'Documents', 'person'),
    tokenHash: view.hash,
    permission: 'view',
    expiresAt: future,
    passwordHash: null,
    createdBy: owner.id,
    createdAt: now.toISOString(),
  });
  store.driveShares.insert({
    id: randomUUID(),
    itemId: itemId(store, 'Large/dataset-small.bin', 'person'),
    tokenHash: download.hash,
    permission: 'download',
    expiresAt: null,
    passwordHash: await passwordHash(SHARE_PASSWORD),
    createdBy: owner.id,
    createdAt: now.toISOString(),
  });
  store.driveFileRequests.create({
    folderItemId: itemId(store, 'Household', 'home'),
    createdBy: owner.id,
    title: 'Send the household receipts',
    message: 'Drop the files here.',
    tokenHash: request.hash,
    expiresAt: future,
  });
  return {
    counts: { shares: 2, fileRequests: 1 },
    paths: [
      buildPath(MEDIA_PATHS.driveShare, { token: view.token }),
      buildPath(MEDIA_PATHS.driveShare, { token: download.token }),
      buildPath(MEDIA_PATHS.driveFileRequest, { token: request.token }),
    ],
  };
}
