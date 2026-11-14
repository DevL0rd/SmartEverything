import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  ApiError,
  DRIVE_PLACEMENT_STATUS,
  type ComputerNodeRow,
  type DrivePlacementStatus,
  type LiveChange,
} from '@smarteverything/domain';
import { SYNC_CLIENT_MESSAGE, type SyncClientMessage } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { WebSocket } from 'ws';
import type { ComputerNodeAccess } from '../../computers/node-access';
import { profileIdOf } from '../../server/auth';
import { ComputerSockets } from '../../server/computer-socket';
import { bearerOf } from '../../server/http';
import type { Store } from '../../store/store';
import { nodeCaller } from '../node-caller';
import type { DriveActor } from '../access';
import { SyncConnection, SyncRegistry, type SyncMode, type SyncSession } from './server-connection';
import { changesAfter, indexIsStale, indexPages } from './server-index';
import { resolveScope, type SyncScope } from './placement-scope';

export type { SyncMode, SyncSession } from './server-connection';

export const DRIVE_SYNC_PROTOCOL = 'smarteverything-drive-sync.v1';
export const DRIVE_SUBSCRIBE_PROTOCOL = 'smarteverything-drive-subscribe.v1';

const CLOSE_POLICY = 1008;
const REASON_LIMIT = 120;
const PRINTABLE = /[^\x20-\x7e]/g;

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

  constructor(
    private readonly store: Store,
    private readonly operations: SyncOperations,
    readonly log: Logger,
  ) {}

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

  placementChanged(placementId: string): void {
    for (const connection of this.registry.ofPlacement(placementId)) {
      this.pump(connection).catch((cause: unknown) => {
        this.refuse(connection, cause);
      });
    }
  }

  private refuse(connection: SyncConnection, cause: unknown): void {
    this.log.warn('drive_sync.refused', {
      deviceId: connection.identity.device_id,
      mode: connection.mode,
      placementId: connection.session?.placementId ?? null,
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
    this.report(session.placementId, message);
    return Promise.resolve();
  }

  private report(placementId: string, message: ClientState): void {
    const { drivePlacements } = this.store;
    const { status } = drivePlacements.byId(placementId);
    const settled = message.need === 0 && message.errors.length === 0;
    const lastSyncedAt =
      settled && (status.needBytes !== 0 || status.lastSyncedAt === null)
        ? this.store.now().toISOString()
        : status.lastSyncedAt;
    const next: DrivePlacementStatus = DRIVE_PLACEMENT_STATUS.parse({
      ...status,
      needBytes: message.need,
      errors: message.errors,
      lastSyncedAt,
    });
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    drivePlacements.writeStatus(placementId, next);
  }

  private async hello(connection: SyncConnection, hello: Hello): Promise<void> {
    if (connection.session !== null) {
      throw new ApiError('conflict', 'This channel already said hello.');
    }
    const actor = this.actorOf(connection);
    const scope = resolveScope(
      this.store,
      hello.placementId,
      connection.identity.device_id,
      connection.mode,
    );
    connection.bind(this.sessionOf(connection, scope, actor), scope.indexId);
    this.registry.add(scope.drive.id, connection);
    if (indexIsStale(this.store, scope, hello.indexId, hello.afterSeq)) {
      await this.sendIndex(connection, scope);
    } else {
      connection.advance(hello.afterSeq);
      await this.sendUpdates(connection, scope, true);
    }
    connection.goLive();
    await this.pump(connection);
  }

  private actorOf(connection: SyncConnection): DriveActor {
    const caller = nodeCaller(this.store, connection.identity);
    return { profileId: profileIdOf(this.store, caller) };
  }

  private sessionOf(connection: SyncConnection, scope: SyncScope, actor: DriveActor): SyncSession {
    return {
      mode: connection.mode,
      placementId: scope.placement.id,
      rootId: scope.drive.id,
      deviceId: connection.identity.device_id,
      profileId: actor.profileId,
      actor,
      send: (message) => connection.deliver(message),
    };
  }

  private async sendIndex(connection: SyncConnection, scope: SyncScope): Promise<void> {
    const seq = this.store.driveFeed.latestSeqInRoot(scope.drive.id);
    const pages = indexPages(this.store, scope);
    let current = pages.next();
    while (current.done !== true) {
      const following = pages.next();
      await connection.deliver({
        type: 'index',
        indexId: scope.indexId,
        seq,
        entries: current.value,
        last: following.done === true,
      });
      current = following;
    }
    connection.advance(seq);
  }

  private async sendUpdates(
    connection: SyncConnection,
    scope: SyncScope,
    announce: boolean,
  ): Promise<void> {
    let force = announce;
    for (;;) {
      const changes = changesAfter(this.store, scope, connection.sentSeq);
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
        const scope = this.currentScope(connection);
        if (scope !== null) await this.sendUpdates(connection, scope, false);
      } while (connection.hasMoreWaiting());
    } finally {
      connection.releasePump();
    }
  }

  private currentScope(connection: SyncConnection): SyncScope | null {
    const session = connection.session;
    if (session === null) return null;
    const scope = resolveScope(this.store, session.placementId, session.deviceId, session.mode);
    if (scope.indexId !== connection.indexId) {
      throw new ApiError('conflict', 'The index was rebuilt; reconnect to index again.');
    }
    return scope;
  }
}

function placementOf(change: LiveChange): string | null {
  if (change.table !== 'drive_placements') return null;
  return (change.record ?? change.oldRecord)?.id ?? null;
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
    const stopNotices = store.feed.subscribeNotices((notice) => {
      if (notice.type === 'drive_changed') core.noticed(notice.rootIds);
    });
    const stopRows = store.feed.subscribe((change) => {
      const placement = placementOf(change);
      if (placement !== null) core.placementChanged(placement);
    });
    this.unsubscribe = (): void => {
      stopNotices();
      stopRows();
    };
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
