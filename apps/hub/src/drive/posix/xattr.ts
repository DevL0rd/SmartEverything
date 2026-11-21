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
import { resultOf, writeDriveOps, type XattrChange } from '../units/ops';
import { actorOf, changeTimes } from './records';
import type { PosixEnv, PosixScope } from './env';
import type { PosixNode } from '../units/posix';
import type { PosixNodes } from './nodes';

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

  private userForbidden(node: PosixNode, name: string): boolean {
    return name.startsWith(USER_PREFIX) && node.inode.type !== 'file' && node.inode.type !== 'dir';
  }

  async get(scope: PosixScope, request: RequestMeta<'GETXATTR'>): Promise<Uint8Array> {
    const node = await this.nodes.node(scope, request.ino);
    const nameRefusal = xattrNameRefusal(request.name);
    if (nameRefusal !== null) refuse(nameRefusal);
    const value = await this.env.change.store.host.call(
      'driveXattrs',
      'get',
      node.inode.id,
      request.name,
    );
    if (value === undefined) refuse('missing');
    return value;
  }

  async list(scope: PosixScope, ino: number): Promise<string[]> {
    const node = await this.nodes.node(scope, ino);
    return this.env.change.store.host.call('driveXattrs', 'names', node.inode.id);
  }

  private change(scope: PosixScope, node: PosixNode, name: string): XattrChange {
    return {
      inodeId: node.inode.id,
      name,
      times: changeTimes(this.env.change, node),
      actor: actorOf(scope.caller),
    };
  }

  async set(scope: PosixScope, request: RequestMeta<'SETXATTR'>, value: Uint8Array): Promise<void> {
    const node = await this.nodes.node(scope, request.ino);
    this.nodes.writable(node);
    if (this.userForbidden(node, request.name)) {
      throw posix('EPERM', 'User extended attributes are only kept on files and folders.');
    }
    const results = await writeDriveOps(this.env.change.store, [
      {
        kind: 'xattrSet',
        xattr: this.change(scope, node, request.name),
        value,
        flag: flagOf(request.flags),
      },
    ]);
    const { set } = resultOf(results, 0, 'xattr');
    if (!set.stored) refuse(set.refusal);
  }

  async remove(scope: PosixScope, request: RequestMeta<'REMOVEXATTR'>): Promise<void> {
    const node = await this.nodes.node(scope, request.ino);
    this.nodes.writable(node);
    const nameRefusal = xattrNameRefusal(request.name);
    if (nameRefusal !== null) refuse(nameRefusal);
    if (this.userForbidden(node, request.name)) {
      throw posix('EPERM', 'User extended attributes are only kept on files and folders.');
    }
    const results = await writeDriveOps(this.env.change.store, [
      { kind: 'xattrRemove', xattr: this.change(scope, node, request.name) },
    ]);
    if (results[0]?.kind === 'missing') refuse('missing');
  }
}
