import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DRIVE_VERSION } from '@smarteverything/domain';
import { z } from 'zod';
import { purgeDeadline, versionRelPath } from '../../apps/hub/src/drive/intents.ts';
import type { Store } from '../../apps/hub/src/store/store.ts';
import { daysAgo } from './clock.ts';
import type { Counted, FilesContext } from './context.ts';
import { layoutOf } from './layout.ts';

const VERSIONED = 'Documents/Notes';
const OFFLINE_FILES = 4;
const COMMITS_PER_STATE = 2;

const ITEM = z.object({
  id: z.string(),
  rel_path: z.string(),
  bytes: z.number(),
  root_id: z.string(),
});
const REVISION = z.object({ rev: z.number() });
const INODE = z.object({ id: z.number() });
const PLACEMENT = z.object({ id: z.string(), device_id: z.string(), root_id: z.string() });

function ownerOf(context: FilesContext): string {
  const owner = context.people[0];
  if (owner === undefined) throw new Error('The household has no owner.');
  return owner.id;
}

interface Draft {
  readonly drive: string;
  readonly item: z.infer<typeof ITEM>;
  readonly ownerId: string;
  readonly at: string;
  readonly rev: number;
  readonly draft: number;
}

async function writeDraft(store: Store, draft: Draft): Promise<void> {
  const { drive, item, ownerId, at } = draft;
  const body = Buffer.from(
    `Earlier draft ${String(draft.draft + 1)} of ${item.rel_path}\n${randomBytes(24).toString('hex')}\n`,
  );
  const sha256 = createHash('sha256').update(body).digest('hex');
  const blob = join(drive, versionRelPath(sha256));
  await mkdir(dirname(blob), { recursive: true });
  await writeFile(blob, body);
  store.driveVersions.insert(
    item.root_id,
    DRIVE_VERSION.parse({
      id: randomUUID(),
      itemId: item.id,
      rev: draft.rev,
      sha256,
      bytes: body.byteLength,
      at,
      purgeAt: purgeDeadline(at),
      actorProfileId: ownerId,
      via: 'app',
      deviceId: null,
      addedByProfileId: ownerId,
    }),
  );
}

async function seedVersions(store: Store, context: FilesContext): Promise<number> {
  const ownerId = ownerOf(context);
  const drive = layoutOf(context.paths).person(ownerId).drive;
  const items = store.database
    .prepare(
      `select i.id, i.rel_path, i.bytes, i.root_id from drive_items i join drive_roots r on r.id = i.root_id
       where r.scope = 'person' and r.owner_profile_id = $owner and i.kind <> 'folder'
         and i.rel_path like $prefix order by i.rel_path limit 6`,
    )
    .all({ owner: ownerId, prefix: `${VERSIONED}/%` })
    .map((row) => ITEM.parse(row));
  const rng = context.rng('drive-versions');
  let count = 0;
  for (const item of items) {
    const drafts = rng.int(2, 4);
    const base = REVISION.parse(
      store.database.prepare('select rev from drive_items where id = $id').get({ id: item.id }),
    ).rev;
    store.database
      .prepare('update drive_items set rev = rev + $n where id = $id')
      .run({ n: drafts, id: item.id });
    const atOf = (draft: number): string =>
      daysAgo(context.anchor, 40 - draft * 9, rng.int(8, 20), rng.int(0, 59)).toISOString();
    for (let draft = 0; draft < drafts; draft += 1) {
      await writeDraft(store, { drive, item, ownerId, at: atOf(draft), rev: base + draft, draft });
      count += 1;
    }
  }
  return count;
}

function seedOffline(store: Store, context: FilesContext): number {
  const member = context.people[1];
  if (member === undefined) throw new Error('The household has no second member.');
  const client = store.clients.create({
    name: 'Seed phone',
    platform: 'android',
    role: 'member',
    tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    profileId: member.id,
  });
  const items = store.database
    .prepare(
      `select i.id, i.rel_path, i.bytes, i.root_id from drive_items i join drive_roots r on r.id = i.root_id
       where r.scope = 'person' and r.owner_profile_id = $owner and i.kind <> 'folder'
       order by i.rel_path limit $limit`,
    )
    .all({ owner: ownerOf(context), limit: OFFLINE_FILES })
    .map((row) => ITEM.parse(row));
  items.forEach((item, index) => {
    store.driveOffline.set(client.id, item.id, member.id, true);
    if (index === 0) return;
    store.driveOffline.report(
      client.id,
      index === items.length - 1
        ? [{ itemId: item.id, state: 'failed', error: 'The phone ran out of space.' }]
        : [{ itemId: item.id, state: 'ready', bytes: item.bytes, rev: 1 }],
    );
  });
  return items.length;
}

function seedCommits(store: Store, context: FilesContext): number {
  const placement = store.database
    .prepare(
      `select id, device_id, root_id from drive_placements where mode = 'mounted' order by created_at limit 1`,
    )
    .get();
  if (placement === undefined) throw new Error('The seeded drive has no mounted placement.');
  const mount = PLACEMENT.parse(placement);
  const inodes = store.database
    .prepare(
      `select id from drive_inodes where root_id = $root and type = 'file' order by id limit $limit`,
    )
    .all({ root: mount.root_id, limit: COMMITS_PER_STATE * 3 })
    .map((row) => INODE.parse(row));
  const rng = context.rng('drive-commits');
  let count = 0;
  inodes.forEach((inode, index) => {
    const commit = store.driveMountCommits.begin({
      placementId: mount.id,
      nodeId: mount.device_id,
      inodeId: inode.id,
      opKey: rng.bytes(16),
      baseRev: 1,
    });
    const size = rng.int(2_000, 90_000);
    if (index % 3 === 0) {
      store.driveMountCommits.setRanges(commit.id, [[0, size]]);
      store.driveMountCommits.finish(commit.id, size, 2);
    } else if (index % 3 === 1) {
      store.driveMountCommits.setRanges(commit.id, [[0, Math.floor(size / 2)]]);
      store.driveMountCommits.abort(commit.id);
    } else {
      store.driveMountCommits.setRanges(commit.id, [[0, Math.floor(size / 3)]]);
    }
    count += 1;
  });
  return count;
}

export async function seedDriveHistory(store: Store, context: FilesContext): Promise<Counted> {
  return {
    versions: await seedVersions(store, context),
    offlineFiles: seedOffline(store, context),
    mountCommits: seedCommits(store, context),
  };
}
