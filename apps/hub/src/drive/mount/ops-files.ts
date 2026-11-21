import { dirname } from 'node:path';
import { background } from '@smarteverything/logging';
import { locate, orphanRelPath } from '../intents';
import type { PosixScope } from '../posix/env';
import { operation, payloadOperation, type Executors } from './operation';
import { Attachment } from './session';
import type { MountServices } from './services';

async function relPathOf(services: MountServices, scope: PosixScope, ino: number): Promise<string> {
  const path = await services.store.host.read('driveMountPath', {
    driveId: scope.drive.id,
    ino,
    name: null,
  });
  return path ?? orphanRelPath(ino);
}

async function durable(
  services: MountServices,
  scope: PosixScope,
  request: { readonly ino: number; readonly directory: boolean },
): Promise<void> {
  const relPath = await relPathOf(services, scope, request.ino);
  const root = await services.store.host.call('driveRoots', 'byId', scope.drive.id);
  const path = await locate(root, relPath);
  await services.fsync.request(request.directory ? [path] : [path, dirname(path)]);
}

function attachment(services: MountServices): Executors {
  const { posix, store, push, staging, commits } = services;
  return {
    ATTACH: operation('ATTACH', async (call) => {
      const { session: active } = call;
      const attached = await posix.attach(active.caller, call.meta.placementId);
      const hinted = active.helperSeqs.get(attached.root);
      active.helperSeqs.delete(attached.root);
      const attachment = new Attachment(attached.scope, hinted ?? attached.seq);
      active.attachments.set(call.meta.placementId, attachment);
      const { host } = store;
      await host.call('driveMountCommits', 'sweep', call.meta.placementId, [...active.journal]);
      for (const commit of await commits.attach(call.meta.placementId)) {
        if (commit.state !== 'open') continue;
        if (commit.nodeId !== active.nodeId || active.journal.has(commit.id)) continue;
        await commits.abortRow(commit.id);
        await staging.remove(attached.root, commit.id);
      }
      setImmediate(() => {
        background(push.pump(active, attachment), 'drive_mount.push_failed');
      });
      return { root: attached.root, ino: attached.ino, attr: attached.attr, seq: attached.seq };
    }),
    LEASE: operation('LEASE', (call) =>
      store.host.call('driveInodeLeases', 'grant', call.session.nodeId, call.meta.count),
    ),
    CANCEL: operation('CANCEL', (call) => {
      call.session.inflight.get(call.meta.requestId)?.cancel();
      return Promise.resolve({});
    }),
  };
}

function handles(services: MountServices): Executors {
  const { store, handles: table, posix } = services;
  return {
    OPEN: operation('OPEN', async (call) => ({
      handle: await table.open(
        call.session,
        await call.session.scopeOf(store, call.meta.ino),
        call.meta.ino,
      ),
    })),
    READ: payloadOperation('READ', async (call) => ({
      meta: {},
      payload: await table.read(call.session, call.meta.handle, call.meta),
    })),
    SEEK: operation('SEEK', async (call) => ({
      offset: await table.seek(call.session, call.meta.handle, call.meta),
    })),
    RELEASE: operation('RELEASE', async (call) => {
      const held = call.session.handles.get(call.meta.handle);
      const orphaned = await table.release(call.session, call.meta.handle);
      if (held !== undefined && orphaned !== null) {
        await posix.releaseOrphan(held.scope.drive.id, orphaned);
      }
      return {};
    }),
    COPY: operation('COPY', (call) => services.copy.copy(call.session, call.meta)),
    ACCESS: operation('ACCESS', async (call) => ({
      attr: await posix.access(await call.session.scopeOf(store, call.meta.ino), call.meta),
    })),
    FSYNC: operation('FSYNC', async (call) => {
      await durable(services, await call.session.scopeOf(store, call.meta.ino), call.meta);
      return {};
    }),
  };
}

function extended(services: MountServices): Executors {
  const { posix, store } = services;
  return {
    GETXATTR: payloadOperation('GETXATTR', async (call) => ({
      meta: {},
      payload: await posix.getxattr(await call.session.scopeOf(store, call.meta.ino), call.meta),
    })),
    LISTXATTR: operation('LISTXATTR', async (call) =>
      posix.listxattr(await call.session.scopeOf(store, call.meta.ino), call.meta.ino),
    ),
  };
}

function commits(services: MountServices): Executors {
  const { commits: protocol, finish } = services;
  const empty = new Uint8Array();
  return {
    BEGIN: operation('BEGIN', (call) => protocol.begin(call.session, call.meta)),
    WRITE: operation('WRITE', async (call) => {
      await protocol.write(call.session, call.meta, call.payload ?? empty);
      return {};
    }),
    ALLOCATE: operation('ALLOCATE', async (call) => {
      await protocol.allocate(call.session, call.meta);
      return {};
    }),
    STATE: operation('STATE', (call) => Promise.resolve(protocol.state(call.session, call.meta))),
    END: operation('END', (call) => finish.end(call.session, call.meta)),
    PUT: operation('PUT', (call) => finish.put(call.session, call.meta, call.payload ?? empty)),
    ABORT: operation('ABORT', async (call) => {
      await protocol.abort(call.session, call.meta);
      return {};
    }),
    FORGET: operation('FORGET', async (call) => {
      await protocol.forget(call.session, call.meta);
      return {};
    }),
  };
}

function locks(services: MountServices): Executors {
  const { locks: table, store } = services;
  return {
    GETLK: operation('GETLK', async (call) => {
      await call.session.scopeOf(store, call.meta.ino);
      return table.get(call.session, call.meta);
    }),
    SETLK: operation('SETLK', async (call) => {
      await call.session.scopeOf(store, call.meta.ino);
      await table.set(call.session, call.meta, (lockId) => {
        call.cancellable(() => {
          table.cancel(lockId);
        });
      });
      return {};
    }),
    UNLOCK: operation('UNLOCK', (call) => {
      table.unlock(call.session, call.meta);
      return Promise.resolve({});
    }),
  };
}

export function fileOperations(services: MountServices): Executors {
  return {
    ...attachment(services),
    ...handles(services),
    ...extended(services),
    ...commits(services),
    ...locks(services),
  };
}
