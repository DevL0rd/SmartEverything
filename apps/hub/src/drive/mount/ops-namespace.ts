import type { ReplyMetaInput, RequestMeta } from '@smarteverything/domain/drive-mount';
import type { PosixScope } from '../posix/env';
import { posix as posixError, posixErrorOf } from '../posix/errors';
import type { Entry } from '../posix/reads';
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
  | 'RMTREE'
  | 'RENAME'
  | 'TMPFILE'
  | 'SETXATTR'
  | 'REMOVEXATTR';

interface Target<Name extends Mutation> {
  readonly name: Name;
  readonly anchor: (meta: RequestMeta<Name>) => number;
  readonly run: (
    scope: PosixScope,
    meta: RequestMeta<Name>,
    payload: Uint8Array,
  ) => Promise<ReplyMetaInput<Name>>;
  readonly replay: (
    scope: PosixScope,
    meta: RequestMeta<Name>,
  ) => Promise<ReplyMetaInput<Name> | null>;
}

const NO_PAYLOAD = new Uint8Array();

function mutation<Name extends Mutation>(services: MountServices, target: Target<Name>): Executors {
  return {
    [target.name]: encodedOperation(target.name, async (call) => {
      const scope = await call.session.scopeOf(services.store, target.anchor(call.meta));
      return services.dedupe.onceEncoded(
        scope.placementId,
        { name: target.name, key: call.meta.opKey },
        () => target.run(scope, call.meta, call.payload ?? NO_PAYLOAD),
        () => target.replay(scope, call.meta),
      );
    }),
  };
}

function reads(services: MountServices): Executors {
  const { posix, store, listings } = services;
  return {
    LOOKUP: operation('LOOKUP', async (call) =>
      posix.lookup(await call.session.scopeOf(store, call.meta.parent), call.meta),
    ),
    GETATTR: operation('GETATTR', async (call) => ({
      attr: await posix.getattr(await call.session.scopeOf(store, call.meta.ino), call.meta.ino),
    })),
    READDIR: operation('READDIR', async (call) => {
      const scope = await call.session.scopeOf(store, call.meta.ino);
      return listings.page(scope, call.meta, () => posix.readdir(scope, call.meta));
    }),
    STATFS: operation('STATFS', async (call) =>
      posix.statfs(await call.session.scopeOf(store, call.meta.ino), call.meta.ino),
    ),
    READLINK: operation('READLINK', async (call) => ({
      target: await posix.readlink(await call.session.scopeOf(store, call.meta.ino), call.meta.ino),
    })),
  };
}

const RERUN = (): Promise<null> => Promise.resolve(null);

const RENAME_EXCHANGE = 2;

async function namedEntry(
  services: MountServices,
  scope: PosixScope,
  parent: number,
  name: string,
): Promise<Entry | null> {
  try {
    return await services.posix.lookup(scope, { parent, name });
  } catch (cause) {
    const known = posixErrorOf(cause);
    if (known?.code === 'ENOENT' || known?.code === 'ENOTDIR') return null;
    throw cause;
  }
}

async function inodeEntry(
  services: MountServices,
  scope: PosixScope,
  ino: number,
): Promise<Entry | null> {
  if ((await services.store.host.call('driveInodes', 'find', ino)) === undefined) return null;
  return { ino, attr: await services.posix.getattr(scope, ino) };
}

async function gone(
  services: MountServices,
  scope: PosixScope,
  meta: { readonly parent: number; readonly name: string; readonly ino: number },
): Promise<Record<string, never> | null> {
  const entry = await namedEntry(services, scope, meta.parent, meta.name);
  return entry?.ino === meta.ino ? null : {};
}

async function leased(services: MountServices, scope: PosixScope, ino: number): Promise<void> {
  if (!(await services.store.host.call('driveInodeLeases', 'holds', scope.caller.nodeId, ino))) {
    throw posixError('EINVAL', `The inode ${String(ino)} is not leased to this computer.`);
  }
}

function creations(services: MountServices): Executors {
  const { posix } = services;
  return {
    ...mutation(services, {
      name: 'MKDIR',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        await leased(services, scope, meta.ino);
        return posix.mkdir(scope, meta);
      },
      replay: (scope, meta) => inodeEntry(services, scope, meta.ino),
    }),
    ...mutation(services, {
      name: 'CREATE',
      anchor: (meta) => meta.parent,
      run: async (scope, meta, payload) => {
        await leased(services, scope, meta.ino);
        return posix.create(scope, meta, payload);
      },
      replay: (scope, meta) => inodeEntry(services, scope, meta.ino),
    }),
    ...mutation(services, {
      name: 'TMPFILE',
      anchor: (meta) => meta.parent,
      run: (scope, meta) => posix.tmpfile(scope, meta),
      replay: RERUN,
    }),
  };
}

function specials(services: MountServices): Executors {
  const { posix } = services;
  return {
    ...mutation(services, {
      name: 'MKNOD',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        await leased(services, scope, meta.ino);
        return posix.mknod(scope, meta);
      },
      replay: (scope, meta) => inodeEntry(services, scope, meta.ino),
    }),
    ...mutation(services, {
      name: 'SYMLINK',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        await leased(services, scope, meta.ino);
        return posix.symlink(scope, meta);
      },
      replay: (scope, meta) => inodeEntry(services, scope, meta.ino),
    }),
    ...mutation(services, {
      name: 'LINK',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => ({ attr: await posix.link(scope, meta) }),
      replay: async (scope, meta) => {
        const entry = await namedEntry(services, scope, meta.parent, meta.name);
        return entry?.ino === meta.ino ? { attr: entry.attr } : null;
      },
    }),
  };
}

function removals(services: MountServices): Executors {
  const { posix } = services;
  return {
    ...mutation(services, {
      name: 'UNLINK',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        await noted(services, scope, meta.parent, meta.name);
        await posix.unlink(scope, meta);
        return {};
      },
      replay: (scope, meta) => gone(services, scope, meta),
    }),
    ...mutation(services, {
      name: 'RMDIR',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        await noted(services, scope, meta.parent, meta.name);
        await posix.rmdir(scope, meta);
        return {};
      },
      replay: (scope, meta) => gone(services, scope, meta),
    }),
    ...mutation(services, {
      name: 'RMTREE',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        await noted(services, scope, meta.parent, meta.name);
        await posix.rmtree(scope, meta);
        return {};
      },
      replay: (scope, meta) => gone(services, scope, meta),
    }),
    ...mutation(services, {
      name: 'RENAME',
      anchor: (meta) => meta.parent,
      run: async (scope, meta) => {
        await noted(services, scope, meta.parent, meta.name);
        await noted(services, scope, meta.newParent, meta.newName);
        await posix.rename(scope, meta);
        return {};
      },
      replay: async (scope, meta) => {
        if ((meta.flags & RENAME_EXCHANGE) !== 0) return {};
        return (await namedEntry(services, scope, meta.parent, meta.name)) === null ? {} : null;
      },
    }),
  };
}

async function noted(
  services: MountServices,
  scope: PosixScope,
  parent: number,
  name: string,
): Promise<void> {
  await services.push.ledger.note(scope.drive.id, await pathOf(services, scope, parent, name));
}

async function pathOf(
  services: MountServices,
  scope: PosixScope,
  parent: number,
  name: string,
): Promise<string> {
  const path = await services.store.host.read('driveMountPath', {
    driveId: scope.drive.id,
    ino: parent,
    name,
  });
  return path ?? name;
}

function attributes(services: MountServices): Executors {
  const { posix, store, dedupe } = services;
  return {
    ...mutation(services, {
      name: 'SETATTR',
      anchor: (meta) => meta.ino,
      run: async (scope, meta) => ({ attr: await posix.setattr(scope, meta) }),
      replay: RERUN,
    }),
    ...mutation(services, {
      name: 'REMOVEXATTR',
      anchor: (meta) => meta.ino,
      run: async (scope, meta) => {
        await posix.removexattr(scope, meta);
        return {};
      },
      replay: RERUN,
    }),
    SETXATTR: operation('SETXATTR', async (call) => {
      const scope = await call.session.scopeOf(store, call.meta.ino);
      return dedupe.once(
        scope.placementId,
        { name: 'SETXATTR', key: call.meta.opKey },
        async () => {
          await posix.setxattr(scope, call.meta, call.payload ?? new Uint8Array());
          return {};
        },
        RERUN,
      );
    }),
  };
}

export function namespaceOperations(services: MountServices): Executors {
  return {
    ...reads(services),
    ...creations(services),
    ...specials(services),
    ...removals(services),
    ...attributes(services),
  };
}
