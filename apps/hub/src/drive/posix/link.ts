import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import type { Attr, RequestMeta } from '@smarteverything/domain/drive-mount';
import { announce, appendFeed, fileDraft, identityOf, isoOf, type FileContent } from '../changes';
import { locate, moveWithin, orphanRelPath } from '../intents';
import { posix } from './errors';
import { checkName, checkNewPath } from './names';
import { actorOf, identityOfItem, touchChange, touchDirectory } from './records';
import type { PosixEnv, PosixScope } from './env';
import type { PosixNode, PosixNodes } from './nodes';
import type { PosixReads } from './reads';

export class PosixLink {
  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
    private readonly reads: PosixReads,
  ) {}

  async link(scope: PosixScope, request: RequestMeta<'LINK'>): Promise<Attr> {
    checkName(request.name);
    const source = this.nodes.crossing(scope, request.ino);
    if (source.inode.type === 'dir') throw posix('EPERM', 'A folder cannot have a second name.');
    const parent = this.nodes.directory(scope, request.parent);
    this.nodes.writable(parent);
    const relPath = this.nodes.relPathOf(parent, request.name);
    checkNewPath(relPath);
    if (this.nodes.childOf(scope, parent, request.name) !== undefined) {
      throw posix('EEXIST', `${request.name} already exists.`);
    }
    const draft =
      source.item === null
        ? await this.adopt(scope, source, { parent, relPath })
        : await this.copy(scope, source.item, { parent, relPath });
    this.settle(scope, source, draft, parent);
    return this.reads.attr(scope, this.nodes.node(scope, request.ino));
  }

  private settle(scope: PosixScope, source: PosixNode, item: DriveItem, parent: PosixNode): void {
    const { change } = this.env;
    change.store.write(() => {
      if (source.inode.orphan) change.store.driveInodes.setOrphan(source.inode.id, false);
      appendFeed(change, item, 'create', actorOf(scope.caller));
      announce(change, item.rootId, item.parentId, [item]);
    });
    touchChange(change, source);
    touchDirectory(change, parent);
  }

  private async copy(
    scope: PosixScope,
    source: DriveItem,
    target: { readonly parent: PosixNode; readonly relPath: string },
  ): Promise<DriveItem> {
    const { change } = this.env;
    const root = this.nodes.root(scope);
    const inodeId = change.store.driveInodes.ofItem(source.id)?.id;
    if (inodeId === undefined) throw posix('EIO', `The item ${source.id} has no inode.`);
    const onDisk = source.kind !== 'special';
    const path = await locate(root, target.relPath);
    if (onDisk) await change.files.link(await locate(root, source.relPath), path);
    try {
      return change.store.write(() => {
        const made = change.store.driveItems.write({
          item: {
            ...source,
            id: randomUUID(),
            parentId: target.parent.item?.id ?? null,
            relPath: target.relPath,
            name: basename(target.relPath),
            addedAt: change.now().toISOString(),
            addedByProfileId: scope.caller.profileId,
            starred: false,
            shared: false,
          },
          identity: identityOfItem(change, source),
          shareInode: inodeId,
        }).item;
        const blocks = change.store.driveBlocks.find(source.id, source.rev);
        if (blocks !== undefined) {
          change.store.driveBlocks.put({ ...blocks, itemId: made.id, rev: made.rev });
        }
        return made;
      });
    } catch (cause) {
      if (onDisk) await change.files.unlink(path);
      throw cause;
    }
  }

  private async adopt(
    scope: PosixScope,
    source: PosixNode,
    target: { readonly parent: PosixNode; readonly relPath: string },
  ): Promise<DriveItem> {
    const { change } = this.env;
    const root = this.nodes.root(scope);
    await moveWithin(change.files, root, {
      from: orphanRelPath(source.inode.id),
      to: target.relPath,
      mode: 'replace',
    });
    const stamp = await change.files.stamp(await locate(root, target.relPath));
    if (stamp === null) throw posix('EIO', 'The file is missing after it was given a name.');
    const content: FileContent = { bytes: stamp.size, sha256: null };
    return change.store.write(
      () =>
        change.store.driveItems.write({
          item: fileDraft(
            {
              rootId: root.id,
              parentId: target.parent.item?.id ?? null,
              relPath: target.relPath,
              modifiedAt: isoOf(stamp.mtimeNs),
              addedAt: change.now().toISOString(),
              outside: false,
              addedByProfileId: scope.caller.profileId,
            },
            content,
          ),
          identity: identityOf(stamp),
          shareInode: source.inode.id,
        }).item,
    );
  }
}
