import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { DriveItem } from '@smarteverything/domain';
import type { Attr, RequestMeta } from '@smarteverything/domain/drive-mount';
import { fileDraft } from '../changes';
import { identityOf, isoOf, type FileContent } from '../change-rows';
import { resultOf, writeDriveOps, type DriveOp } from '../units/ops';
import { locate, moveWithin, orphanRelPath } from '../intents';
import { posix } from './errors';
import { checkName, checkNewPath } from './names';
import { announceOp, identityOfItem, touchChange, touchDirectory } from './records';
import type { PosixEnv, PosixScope } from './env';
import type { PosixNode } from '../units/posix';
import type { PosixNodes } from './nodes';
import type { PosixReads } from './reads';

export class PosixLink {
  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
    private readonly reads: PosixReads,
  ) {}

  async link(scope: PosixScope, request: RequestMeta<'LINK'>): Promise<Attr> {
    checkName(request.name);
    const source = await this.nodes.crossing(scope, request.ino);
    if (source.inode.type === 'dir') throw posix('EPERM', 'A folder cannot have a second name.');
    const { parent, child } = await this.nodes.childIn(scope, request.parent, request.name);
    this.nodes.writable(parent);
    const relPath = this.nodes.relPathOf(parent, request.name);
    checkNewPath(relPath);
    if (child !== undefined) throw posix('EEXIST', `${request.name} already exists.`);
    const draft =
      source.item === null
        ? await this.adopt(scope, source, { parent, relPath })
        : await this.copy(scope, source.item, { parent, relPath });
    await this.settle(scope, source, draft, parent);
    return this.reads.attr(scope, await this.nodes.node(scope, request.ino));
  }

  private async settle(
    scope: PosixScope,
    source: PosixNode,
    item: DriveItem,
    parent: PosixNode,
  ): Promise<void> {
    const { change } = this.env;
    const ops: DriveOp[] = source.inode.orphan
      ? [{ kind: 'orphanFlag', inodeId: source.inode.id, orphan: false }]
      : [];
    await writeDriveOps(change.store, [
      ...ops,
      announceOp(scope.caller, item, 'create'),
      touchChange(change, source),
      touchDirectory(change, parent),
    ]);
  }

  private async copy(
    scope: PosixScope,
    source: DriveItem,
    target: { readonly parent: PosixNode; readonly relPath: string },
  ): Promise<DriveItem> {
    const { change } = this.env;
    const root = await this.nodes.root(scope);
    const inode = await change.store.host.call('driveInodes', 'ofItem', source.id);
    if (inode === undefined) throw posix('EIO', `The item ${source.id} has no inode.`);
    const identity = await identityOfItem(change, source);
    const onDisk = source.kind !== 'special';
    const path = await locate(root, target.relPath);
    if (onDisk) await change.files.link(await locate(root, source.relPath), path);
    try {
      const results = await writeDriveOps(change.store, [
        {
          kind: 'write',
          draft: {
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
          identity,
          shareInode: inode.id,
          blocksOf: { itemId: source.id, rev: source.rev },
        },
      ]);
      return resultOf(results, 0, 'item').item;
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
    const root = await this.nodes.root(scope);
    await moveWithin(change.files, root, {
      from: orphanRelPath(source.inode.id),
      to: target.relPath,
      mode: 'replace',
    });
    const stamp = await change.files.stamp(await locate(root, target.relPath));
    if (stamp === null) throw posix('EIO', 'The file is missing after it was given a name.');
    const content: FileContent = { bytes: stamp.size, sha256: null };
    const results = await writeDriveOps(change.store, [
      {
        kind: 'write',
        draft: fileDraft(
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
        blocksOf: null,
      },
    ]);
    return resultOf(results, 0, 'item').item;
  }
}
