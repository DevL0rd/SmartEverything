import {
  XATTR_FLAGS,
  type DriveMountErrorName,
  type RequestMeta,
} from '@smarteverything/domain/drive-mount';
import {
  xattrNameRefusal,
  type XattrFlag,
  type XattrRefusal,
} from '../../store/repositories/drive-xattrs';
import { posix } from './errors';
import { recordOp, touchChange } from './records';
import type { PosixEnv, PosixScope } from './env';
import type { PosixNode, PosixNodes } from './nodes';

const USER_PREFIX = 'user.';

const REFUSALS: Readonly<Record<XattrRefusal, readonly [DriveMountErrorName, string]>> = {
  unsupported: ['EOPNOTSUPP', 'That extended attribute namespace is not supported.'],
  name_invalid: ['ERANGE', 'The extended attribute name is empty or too long.'],
  exists: ['EEXIST', 'The extended attribute already exists.'],
  missing: ['ENODATA', 'The extended attribute does not exist.'],
  value_too_big: ['E2BIG', 'The extended attribute value is too big.'],
  list_too_big: ['ENOSPC', 'The extended attributes of the file take too much room.'],
};

function flagOf(flags: number): XattrFlag {
  if (flags === XATTR_FLAGS.create) return 'create';
  if (flags === XATTR_FLAGS.replace) return 'replace';
  return 'any';
}

function refuse(refusal: XattrRefusal): never {
  const [code, message] = REFUSALS[refusal];
  throw posix(code, message);
}

export class PosixXattrs {
  constructor(
    private readonly env: PosixEnv,
    private readonly nodes: PosixNodes,
  ) {}

  private get xattrs(): PosixEnv['change']['store']['driveXattrs'] {
    return this.env.change.store.driveXattrs;
  }

  private userForbidden(node: PosixNode, name: string): boolean {
    return name.startsWith(USER_PREFIX) && node.inode.type !== 'file' && node.inode.type !== 'dir';
  }

  get(scope: PosixScope, request: RequestMeta<'GETXATTR'>): Uint8Array {
    const node = this.nodes.node(scope, request.ino);
    const nameRefusal = xattrNameRefusal(request.name);
    if (nameRefusal !== null) refuse(nameRefusal);
    const value = this.xattrs.get(node.inode.id, request.name);
    if (value === undefined) refuse('missing');
    return value;
  }

  list(scope: PosixScope, ino: number): readonly string[] {
    return this.xattrs.names(this.nodes.node(scope, ino).inode.id);
  }

  set(scope: PosixScope, request: RequestMeta<'SETXATTR'>, value: Uint8Array): void {
    const node = this.nodes.node(scope, request.ino);
    this.nodes.writable(node);
    if (this.userForbidden(node, request.name)) {
      throw posix('EPERM', 'User extended attributes are only kept on files and folders.');
    }
    const { change } = this.env;
    const result = change.store.write(() => {
      const stored = this.xattrs.set(node.inode.id, request.name, value, flagOf(request.flags));
      if (stored.stored) this.recordChange(scope, node);
      return stored;
    });
    if (!result.stored) refuse(result.refusal);
  }

  private recordChange(scope: PosixScope, node: PosixNode): void {
    const { change } = this.env;
    touchChange(change, node);
    for (const id of change.store.driveInodes.names(node.inode.id)) {
      const item = change.store.driveItems.find(id, null);
      if (item !== undefined) recordOp(change, scope.caller, item, 'update');
    }
  }

  remove(scope: PosixScope, request: RequestMeta<'REMOVEXATTR'>): void {
    const node = this.nodes.node(scope, request.ino);
    this.nodes.writable(node);
    const nameRefusal = xattrNameRefusal(request.name);
    if (nameRefusal !== null) refuse(nameRefusal);
    if (this.userForbidden(node, request.name)) {
      throw posix('EPERM', 'User extended attributes are only kept on files and folders.');
    }
    const removed = this.env.change.store.write(() => {
      const done = this.xattrs.remove(node.inode.id, request.name);
      if (done) this.recordChange(scope, node);
      return done;
    });
    if (!removed) refuse('missing');
  }
}
