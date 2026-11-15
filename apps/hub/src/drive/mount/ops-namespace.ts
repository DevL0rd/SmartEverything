import type { ReplyMetaInput, RequestMeta } from '@smarteverything/domain/drive-mount';
import type { PosixScope } from '../posix/env';
import { encodedOperation, operation, type Executors } from './operation';
import type { MountServices } from './services';

type Mutation =
  | 'SETATTR'
  | 'MKDIR'
  | 'CREATE'
  | 'MKNOD'
  | 'SYMLINK'
  | 'LINK'
  | 'UNLINK'
  | 'RMDIR'
  | 'RENAME'
  | 'TMPFILE'
  | 'SETXATTR'
  | 'REMOVEXATTR';

interface Target<Name extends Mutation> {
  readonly name: Name;
  readonly anchor: (meta: RequestMeta<Name>) => number;
  readonly run: (scope: PosixScope, meta: RequestMeta<Name>) => Promise<ReplyMetaInput<Name>>;
}

function mutation<Name extends Mutation>(services: MountServices, target: Target<Name>): Executors {
  return {
    [target.name]: encodedOperation(target.name, (call) => {
      const scope = call.session.scopeOf(services.store, target.anchor(call.meta));
      return services.dedupe.onceEncoded(
        scope.placementId,
        { name: target.name, key: call.meta.opKey },
        () => target.run(scope, call.meta),
      );
    }),
  };
}

function reads(services: MountServices): Executors {
  const { posix, store } = services;
  return {
    LOOKUP: operation('LOOKUP', (call) =>
      posix.lookup(call.session.scopeOf(store, call.meta.parent), call.meta),
    ),
    GETATTR: operation('GETATTR', async (call) => ({
      attr: await posix.getattr(call.session.scopeOf(store, call.meta.ino), call.meta.ino),
    })),
    READDIR: operation('READDIR', (call) =>
      posix.readdir(call.session.scopeOf(store, call.meta.ino), call.meta),
    ),
    STATFS: operation('STATFS', (call) =>
      posix.statfs(call.session.scopeOf(store, call.meta.ino), call.meta.ino),
    ),
    READLINK: operation('READLINK', async (call) => ({
      target: await posix.readlink(call.session.scopeOf(store, call.meta.ino), call.meta.ino),
    })),
  };
}

function creations(services: MountServices): Executors {
  const { posix } = services;
  return {
    ...mutation(services, {
      name: 'MKDIR',
      anchor: (meta) => meta.parent,
      run: (scope, meta) => posix.mkdir(scope, meta),
    }),
    ...mutation(services, {
      name: 'CREATE',
      anchor: (meta) => meta.parent,
      run: (scope, meta) => posix.create(scope, meta),
    }),
    ...mutation(services, {
      name: 'MKNOD',
      anchor: (meta) => meta.parent,
      run: (scope, meta) => posix.mknod(scope, meta),
    }),
    ...mutation(services, {
      name: 'SYMLINK',
      anchor: (meta) => meta.parent,
      run: (scope, meta) => posix.symlink(scope, meta),
    }),
    ...mutation(services, {
      name: 'TMPFILE',
      anchor: (meta) => meta.parent,
      run: (scope, meta) => posix.tmpfile(scope, meta),
    }),
    ...mutation(services, {
      name: 'LINK',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => ({ attr: await posix.link(scope, meta) }),
    }),
  };
}

function removals(services: MountServices): Executors {
  const { posix, push } = services;
  return {
    ...mutation(services, {
      name: 'UNLINK',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        push.ledger.note(scope.drive.id, pathOf(services, scope, meta.parent, meta.name));
        await posix.unlink(scope, meta);
        return {};
      },
    }),
    ...mutation(services, {
      name: 'RMDIR',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        push.ledger.note(scope.drive.id, pathOf(services, scope, meta.parent, meta.name));
        await posix.rmdir(scope, meta);
        return {};
      },
    }),
    ...mutation(services, {
      name: 'RENAME',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        push.ledger.note(scope.drive.id, pathOf(services, scope, meta.parent, meta.name));
        push.ledger.note(scope.drive.id, pathOf(services, scope, meta.newParent, meta.newName));
        await posix.rename(scope, meta);
        return {};
      },
    }),
  };
}

function pathOf(services: MountServices, scope: PosixScope, parent: number, name: string): string {
  const { store } = services;
  const inode = store.driveInodes.find(parent);
  if (inode?.rootId !== scope.drive.id || inode.isRoot) return name;
  const id = store.driveInodes.names(parent)[0];
  const item = id === undefined ? undefined : store.driveItems.find(id, null);
  return item === undefined ? name : `${item.relPath}/${name}`;
}

function attributes(services: MountServices): Executors {
  const { posix, store, dedupe } = services;
  return {
    ...mutation(services, {
      name: 'SETATTR',
      anchor: (meta) => meta.ino,
      run: async (scope, meta) => ({ attr: await posix.setattr(scope, meta) }),
    }),
    ...mutation(services, {
      name: 'REMOVEXATTR',
      anchor: (meta) => meta.ino,
      run: async (scope, meta) => {
        await posix.removexattr(scope, meta);
        return {};
      },
    }),
    SETXATTR: operation('SETXATTR', (call) => {
      const scope = call.session.scopeOf(store, call.meta.ino);
      return dedupe.once(
        scope.placementId,
        { name: 'SETXATTR', key: call.meta.opKey },
        async () => {
          await posix.setxattr(scope, call.meta, call.payload ?? new Uint8Array());
          return {};
        },
      );
    }),
  };
}

export function namespaceOperations(services: MountServices): Executors {
  return {
    ...reads(services),
    ...creations(services),
    ...removals(services),
    ...attributes(services),
  };
}
