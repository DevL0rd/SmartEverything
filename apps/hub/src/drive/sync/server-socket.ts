import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { ApiError, type ComputerNodeRow, type DriveRoot } from '@smarteverything/domain';
import { SYNC_CLIENT_MESSAGE, type SyncClientMessage } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { WebSocket } from 'ws';
import type { ComputerNodeAccess } from '../../computers/node-access';
import { profileIdOf, roleOfCaller } from '../../server/auth';
import { ComputerSockets } from '../../server/computer-socket';
import { bearerOf } from '../../server/http';
import type { Store } from '../../store/store';
import { nodeCaller } from '../node-caller';
import { DriveReadService, type DriveActor } from '../service-read';
import { SyncConnection, SyncRegistry, type SyncMode, type SyncSession } from './server-connection';
import { changesAfter, indexIsStale, indexPages } from './server-index';

export type { SyncMode, SyncSession } from './server-connection';

export const DRIVE_SYNC_PROTOCOL = 'smarteverything-drive-sync.v1';
export const DRIVE_SUBSCRIBE_PROTOCOL = 'smarteverything-drive-subscribe.v1';

const CLOSE_POLICY = 1008;
const REASON_LIMIT = 120;
const PRINTABLE = /[^\x20-\x7e]/g;

type SyncedRoot = Exclude<DriveRoot, { readonly synced: false }>;

type Hello = Extract<SyncClientMessage, { type: 'hello' }>;
type ClientState = Extract<SyncClientMessage, { type: 'client_state' }>;

export type SyncOperation = Exclude<SyncClientMessage, Hello | ClientState>;

export interface SyncOperations {
  readonly handle: (session: SyncSession, message: SyncOperation) => Promise<void>;
}

function refusalOf(cause: unknown): string {
  if (!(cause instanceof ApiError)) return 'Invalid sync message';
  return cause.message.replace(PRINTABLE, '').slice(0, REASON_LIMIT);
}

class DriveSyncCore {
  readonly registry = new SyncRegistry();
  private readonly read: DriveReadService;

  constructor(
    private readonly store: Store,
    private readonly operations: SyncOperations,
    readonly log: Logger,
  ) {
    this.read = new DriveReadService(store);
  }

  admit(access: ComputerNodeAccess, request: IncomingMessage): void {
    try {
      nodeCaller(this.store, access.authenticate(bearerOf(request)));
    } catch (cause) {
      this.log.warn('drive_sync.refused_upgrade', { reason: messageOf(cause) });
      throw cause;
    }
  }

  receive(connection: SyncConnection, frame: unknown): void {
    const parsed = SYNC_CLIENT_MESSAGE.safeParse(frame);
    if (!parsed.success) {
      this.refuse(connection, parsed.error);
      return;
    }
    connection.enqueue(
      () => this.handle(connection, parsed.data),
      (cause) => {
        this.refuse(connection, cause);
      },
    );
  }

  noticed(rootIds: readonly string[]): void {
    for (const rootId of rootIds) {
      for (const connection of this.registry.of(rootId)) {
        this.pump(connection).catch((cause: unknown) => {
          this.refuse(connection, cause);
        });
      }
    }
  }

  private refuse(connection: SyncConnection, cause: unknown): void {
    this.log.warn('drive_sync.refused', {
      deviceId: connection.identity.device_id,
      mode: connection.mode,
      rootId: connection.session?.rootId ?? null,
      reason: messageOf(cause),
    });
    connection.close(CLOSE_POLICY, refusalOf(cause));
  }

  private handle(connection: SyncConnection, message: SyncClientMessage): Promise<void> {
    if (message.type === 'hello') return this.hello(connection, message);
    const session = connection.session;
    if (session === null) {
      throw new ApiError('forbidden', 'Say hello before sending anything else.');
    }
    if (session.mode !== 'sync') {
      throw new ApiError('forbidden', 'This channel only listens for changes.');
    }
    if (message.type !== 'client_state') return this.operations.handle(session, message);
    this.store.driveSyncClients.report(session.clientId, session.rootId, {
      lastSeq: connection.sentSeq,
      needBytes: message.need,
      errors: message.errors,
    });
    return Promise.resolve();
  }

  private async hello(connection: SyncConnection, hello: Hello): Promise<void> {
    if (connection.session !== null) {
      throw new ApiError('conflict', 'This channel already said hello.');
    }
    const actor = this.actorOf(connection);
    const root = this.read.rootFor(actor, hello.rootId);
    connection.bind(this.sessionOf(connection, hello, root, actor), root.indexId);
    this.registry.add(root.id, connection);
    if (indexIsStale(this.store, root, hello.indexId, hello.afterSeq)) {
      await this.sendIndex(connection, root);
    } else {
      connection.advance(hello.afterSeq);
      await this.sendUpdates(connection, true);
    }
    connection.goLive();
    await this.pump(connection);
  }

  private actorOf(connection: SyncConnection): DriveActor {
    const caller = nodeCaller(this.store, connection.identity);
    return { profileId: profileIdOf(this.store, caller), owner: roleOfCaller(caller) === 'owner' };
  }

  private sessionOf(
    connection: SyncConnection,
    hello: Hello,
    root: DriveRoot,
    actor: DriveActor,
  ): SyncSession {
    const deviceId = connection.identity.device_id;
    if (connection.mode === 'sync') this.enroll(hello.clientId, root, actor, deviceId);
    return {
      mode: connection.mode,
      clientId: hello.clientId,
      rootId: root.id,
      deviceId,
      profileId: actor.profileId,
      actor,
      send: (message) => connection.deliver(message),
    };
  }

  private enroll(clientId: string, root: DriveRoot, actor: DriveActor, deviceId: string): void {
    if (!root.synced) {
      throw new ApiError('invalid_request', 'This library folder is not synced.');
    }
    if (this.store.clients.find(clientId)?.profile_id !== actor.profileId) {
      throw new ApiError('forbidden', 'This sync client is not registered for this person.');
    }
    const known = this.store.driveSyncClients.find(clientId, root.id);
    if (known === undefined) {
      this.register(clientId, root, actor, deviceId);
      return;
    }
    if (known.deviceId !== deviceId || known.profileId !== actor.profileId) {
      throw new ApiError('forbidden', 'This sync client belongs to another computer.');
    }
    if (!known.enabled) {
      throw new ApiError('forbidden', 'Sync is switched off for this computer and folder.');
    }
  }

  private register(clientId: string, root: SyncedRoot, actor: DriveActor, deviceId: string): void {
    this.store.write(() => {
      this.store.driveSyncClients.set(
        { clientId, rootId: root.id, enabled: true, selected: [] },
        { deviceId, profileId: actor.profileId },
      );
      const others = root.sync.clients.filter((one) => one.clientId !== clientId);
      this.store.driveRoots.update(root.id, {
        sync: { ...root.sync, clients: [...others, { clientId, enabled: true }] },
      });
    });
  }

  private async sendIndex(connection: SyncConnection, root: DriveRoot): Promise<void> {
    const seq = this.store.driveFeed.latestSeqInRoot(root.id);
    const pages = indexPages(this.store, root.id);
    let current = pages.next();
    while (current.done !== true) {
      const following = pages.next();
      await connection.deliver({
        type: 'index',
        indexId: root.indexId,
        seq,
        entries: current.value,
        last: following.done === true,
      });
      current = following;
    }
    connection.advance(seq);
  }

  private async sendUpdates(connection: SyncConnection, announce: boolean): Promise<void> {
    const session = connection.session;
    if (session === null) return;
    let force = announce;
    for (;;) {
      const changes = changesAfter(this.store, session.rootId, connection.sentSeq);
      if (changes.seq === connection.sentSeq && !force) return;
      force = false;
      await connection.deliver({
        type: 'index_update',
        seq: changes.seq,
        entries: changes.entries,
      });
      connection.advance(changes.seq);
      if (!changes.more) return;
    }
  }

  private async pump(connection: SyncConnection): Promise<void> {
    if (!connection.claimPump()) return;
    try {
      do {
        connection.startRound();
        this.assertCurrent(connection);
        await this.sendUpdates(connection, false);
      } while (connection.hasMoreWaiting());
    } finally {
      connection.releasePump();
    }
  }

  private assertCurrent(connection: SyncConnection): void {
    const session = connection.session;
    if (session === null) return;
    const root = this.store.driveRoots.find(session.rootId);
    if (root === undefined) throw new ApiError('not_found', 'This library folder was removed.');
    if (root.indexId !== connection.indexId) {
      throw new ApiError('conflict', 'The index was rebuilt; reconnect to index again.');
    }
    if (session.mode !== 'sync') return;
    const client = this.store.driveSyncClients.find(session.clientId, session.rootId);
    if (client?.enabled !== true) {
      throw new ApiError('forbidden', 'Sync is switched off for this computer and folder.');
    }
  }
}

class DriveSyncEndpoint extends ComputerSockets<SyncConnection> {
  constructor(
    private readonly mode: SyncMode,
    private readonly core: DriveSyncCore,
    access: ComputerNodeAccess,
  ) {
    super(mode === 'sync' ? DRIVE_SYNC_PROTOCOL : DRIVE_SUBSCRIBE_PROTOCOL, access, core.log);
  }

  override upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.core.admit(this.access, request);
    super.upgrade(request, socket, head);
  }

  protected open(socket: WebSocket, identity: ComputerNodeRow): SyncConnection {
    return new SyncConnection(socket, identity, this.mode, (connection) => {
      this.core.registry.remove(connection);
    });
  }

  protected receive(connection: SyncConnection, frame: unknown): void {
    this.core.receive(connection, frame);
  }
}

export class DriveSyncServer {
  private readonly sync: DriveSyncEndpoint;
  private readonly subscribe: DriveSyncEndpoint;
  private readonly unsubscribe: () => void;

  constructor(store: Store, access: ComputerNodeAccess, operations: SyncOperations, log: Logger) {
    const core = new DriveSyncCore(store, operations, log);
    this.sync = new DriveSyncEndpoint('sync', core, access);
    this.subscribe = new DriveSyncEndpoint('subscribe', core, access);
    this.unsubscribe = store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed') core.noticed(notice.rootIds);
    });
  }

  upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const offered = (request.headers['sec-websocket-protocol'] ?? '')
      .split(',')
      .map((value) => value.trim());
    const endpoint = offered.includes(DRIVE_SUBSCRIBE_PROTOCOL) ? this.subscribe : this.sync;
    endpoint.upgrade(request, socket, head);
  }

  revoke(deviceId: string): void {
    this.sync.revoke(deviceId);
    this.subscribe.revoke(deviceId);
  }

  stop(): void {
    this.unsubscribe();
    this.sync.stop();
    this.subscribe.stop();
  }
}
