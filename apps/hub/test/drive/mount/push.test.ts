import type { PushMeta, ReplyMeta } from '@smarteverything/domain/drive-mount';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitTrash } from '../../../src/drive/trash-purge';
import { save } from '../posix/posix-rig';
import { attachTo, opKey, openMountRig, until, type Attached, type MountRig } from './mount-rig';

let rig: MountRig;
let writer: Attached;
let reader: Attached;

beforeEach(async () => {
  rig = await openMountRig(30_000);
  writer = await attachTo(
    rig,
    { nodeId: rig.posix.node, profileId: rig.posix.ownerId },
    rig.posix.shared.id,
  );
  reader = await attachTo(
    rig,
    { nodeId: rig.posix.memberNode, profileId: rig.posix.memberId },
    rig.posix.shared.id,
  );
});

afterEach(async () => {
  await rig.close();
});

function create(name: string, parent = writer.root): Promise<ReplyMeta<'CREATE'>> {
  return writer.client.created(parent, name);
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 60));
}

function seen(attached: Attached): PushMeta<'CHANGED'>[] {
  return attached.client.pushed('CHANGED');
}

describe('change pushes', () => {
  it('tells another computer about a new file and its folder', async () => {
    const file = await create('new.txt');
    await until(() => seen(reader).length > 0, 'a push');
    const [push] = seen(reader);
    expect(push?.entries).toContainEqual([writer.root, 'new.txt']);
    expect(push?.inodes).toEqual(expect.arrayContaining([file.ino, writer.root]));
    expect(push?.root).toBe(rig.posix.shared.id);
  });

  it('does not echo a change to the computer that made it', async () => {
    const own = await writer.client.call('MKDIR', {
      parent: writer.root,
      name: 'own',
      ino: await writer.client.ino(),
      mode: 0o755,
      uid: null,
      gid: null,
      mtimeNs: 1_763_100_000_000_000_000n,
      opKey: opKey(),
    });
    await until(() => seen(reader).length > 0, 'a push');
    await settled();
    expect(seen(writer).filter((push) => push.inodes.includes(own.ino))).toEqual([]);
  });

  it('tells about both names of a rename', async () => {
    const file = await create('before.txt');
    await until(() => seen(reader).length > 0, 'the create');
    const before = seen(reader).length;
    await writer.client.call('RENAME', {
      parent: writer.root,
      name: 'before.txt',
      newParent: writer.root,
      newName: 'after.txt',
      flags: 0,
      opKey: opKey(),
    });
    await until(() => seen(reader).length > before, 'the rename');
    const names = seen(reader)
      .slice(before)
      .flatMap((push) => push.entries.map(([, name]) => name));
    expect(names).toEqual(expect.arrayContaining(['before.txt', 'after.txt']));
    expect(file.ino).toBeGreaterThan(0);
  });

  it('tells about a removed file with its entry and inode', async () => {
    const file = await create('gone.txt');
    await until(() => seen(reader).length > 0, 'the create');
    const before = seen(reader).length;
    await writer.client.call('UNLINK', {
      parent: writer.root,
      name: 'gone.txt',
      ino: file.ino,
      opKey: opKey(),
    });
    await until(() => seen(reader).length > before, 'the removal');
    const pushed = seen(reader).slice(before);
    expect(pushed.flatMap((push) => push.entries)).toContainEqual([writer.root, 'gone.txt']);
    const touched = pushed.flatMap((push) => [...push.removed, ...push.inodes]);
    expect(touched).toContain(file.ino);
  });

  it('tells about a content change made outside the mount', async () => {
    await create('app.txt');
    await until(() => seen(reader).length > 0, 'the create');
    const before = seen(reader).length;
    await save(rig.posix, rig.posix.shared, 'app.txt', 'from the app');
    await until(() => seen(reader).length > before, 'the update');
    expect(seen(reader).at(-1)?.entries).toContainEqual([reader.root, 'app.txt']);
  });

  it('resets the caches when a removal outside the mount cannot be placed', async () => {
    const item = await save(rig.posix, rig.posix.shared, 'quiet.txt', 'q');
    await settled();
    rig.mount.services.push.ledger.swap(item.id, undefined);
    await commitTrash(
      rig.posix.env.change,
      rig.posix.opened.store.driveRoots.byId(rig.posix.shared.id),
      item.id,
      { actorProfileId: rig.posix.ownerId, via: 'app', deviceId: null },
    );
    await until(() => reader.client.pushed('RESET').length > 0, 'a reset');
    expect(reader.client.pushed('RESET')[0]?.root).toBe(rig.posix.shared.id);
  });
});

describe('replay after a gap', () => {
  it('replays what was missed after the seq the computer last saw', async () => {
    const seq = rig.posix.opened.store.driveFeed.latestSeqInRoot(rig.posix.shared.id);
    reader.client.close();
    await create('missed-1.txt');
    await create('missed-2.txt');
    const next = await rig.connect(rig.posix.memberNode);
    await next.hello({ seqs: [{ root: rig.posix.shared.id, seq }] });
    await next.call('ATTACH', { placementId: reader.placementId });
    await until(() => next.pushed('CHANGED').length > 0, 'the replay');
    const names = next.pushed('CHANGED').flatMap((push) => push.entries.map(([, name]) => name));
    expect(names).toEqual(expect.arrayContaining(['missed-1.txt', 'missed-2.txt']));
  });

  it('replays on a resumed session without a new attach', async () => {
    const seq = rig.posix.opened.store.driveFeed.latestSeqInRoot(rig.posix.shared.id);
    const session = reader.client.session;
    reader.client.close();
    await create('while-away.txt');
    const next = await rig.connect(rig.posix.memberNode);
    const reply = await next.hello({ session, seqs: [{ root: rig.posix.shared.id, seq }] });
    expect(reply.resumed).toBe(true);
    await until(() => next.pushed('CHANGED').length > 0, 'the replay');
    expect(next.pushed('CHANGED')[0]?.entries).toContainEqual([writer.root, 'while-away.txt']);
  });

  it('replays its own changes to a restarted computer whose cache may be behind', async () => {
    const seq = rig.posix.opened.store.driveFeed.latestSeqInRoot(rig.posix.shared.id);
    await create('own-before-crash.txt');
    writer.client.close();
    const next = await rig.connect(rig.posix.node);
    const reply = await next.hello({ session: null, seqs: [{ root: rig.posix.shared.id, seq }] });
    expect(reply.resumed).toBe(false);
    await next.call('ATTACH', { placementId: writer.placementId });
    await until(() => next.pushed('CHANGED').length > 0, 'the replay of its own change');
    expect(next.pushed('CHANGED')[0]?.entries).toContainEqual([
      writer.root,
      'own-before-crash.txt',
    ]);
    await next.created(writer.root, 'own-after-restart.txt');
    await settled();
    const names = next.pushed('CHANGED').flatMap((push) => push.entries.map(([, name]) => name));
    expect(names).not.toContain('own-after-restart.txt');
  });

  it('resets when the computer is ahead of the Hub', async () => {
    const next = await rig.connect(rig.posix.memberNode);
    const seq = rig.posix.opened.store.driveFeed.latestSeqInRoot(rig.posix.shared.id) + 500;
    await next.hello({ seqs: [{ root: rig.posix.shared.id, seq }] });
    await next.call('ATTACH', { placementId: reader.placementId });
    await until(() => next.pushed('RESET').length > 0, 'a reset');
    expect(next.pushed('RESET')[0]).toMatchObject({ root: rig.posix.shared.id });
  });

  it('sends nothing about a drive the computer did not attach', async () => {
    const stranger = await attachTo(
      rig,
      { nodeId: rig.posix.memberNode, profileId: rig.posix.memberId },
      rig.posix.theirs.id,
    );
    await create('private.txt');
    await settled();
    expect(seen(stranger)).toEqual([]);
    expect(seen(reader).length).toBeGreaterThan(0);
  });
});
