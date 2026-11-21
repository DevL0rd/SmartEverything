import type { StoredDrive } from '../../store/repositories/drive-roots';
import { canWrite } from '../access';
import type { FoundChild, NodeMode, NodeScope, PosixNode } from '../units/posix';
import { posix } from './errors';
import { checkName } from './names';
import type { PosixEnv, PosixScope } from './env';

export function nodeScopeOf(scope: PosixScope): NodeScope {
  const { profileId, lockedFolder } = scope.caller;
  return {
    driveId: scope.drive.id,
    baseId: scope.baseId,
    caller: lockedFolder === undefined ? { profileId } : { profileId, lockedFolder },
  };
}

export class PosixNodes {
  constructor(private readonly env: PosixEnv) {}

  private get host(): PosixEnv['change']['store']['host'] {
    return this.env.change.store.host;
  }

  root(scope: PosixScope): Promise<StoredDrive> {
    return this.host.call('driveRoots', 'byId', scope.drive.id);
  }

  private resolve(scope: PosixScope, ino: number, mode: NodeMode): Promise<PosixNode> {
    return this.host.read('drivePosixNode', { scope: nodeScopeOf(scope), ino, mode });
  }

  node(scope: PosixScope, ino: number): Promise<PosixNode> {
    return this.resolve(scope, ino, 'node');
  }

  crossing(scope: PosixScope, ino: number): Promise<PosixNode> {
    return this.resolve(scope, ino, 'crossing');
  }

  directory(scope: PosixScope, ino: number): Promise<PosixNode> {
    return this.resolve(scope, ino, 'directory');
  }

  relPathOf(parent: PosixNode, name: string): string {
    return parent.item === null ? name : `${parent.item.relPath}/${name}`;
  }

  childIn(
    scope: PosixScope,
    parentIno: number,
    name: string,
    crossing = false,
  ): Promise<FoundChild> {
    checkName(name);
    return this.host.read('drivePosixChild', {
      scope: nodeScopeOf(scope),
      parentIno,
      crossing,
      name,
    });
  }

  writable(node: PosixNode): void {
    if (!canWrite(node.access))
      throw posix('EACCES', 'You can only view this; you cannot change it.');
  }
}
