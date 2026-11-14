import type { ComputerNodeRow } from '@smarteverything/domain';
import { SYNC_HUB_MESSAGE, type SyncHubMessage } from '@smarteverything/domain/drive-sync';
import type { WebSocket } from 'ws';
import { ComputerConnection } from '../../server/computer-socket';
import type { DriveActor } from '../access';

export type SyncMode = 'sync' | 'subscribe';

export interface SyncSession {
  readonly mode: SyncMode;
  readonly placementId: string;
  readonly rootId: string;
  readonly deviceId: string;
  readonly profileId: string;
  readonly actor: DriveActor;
  readonly send: (message: SyncHubMessage) => Promise<void>;
}

export class SyncConnection extends ComputerConnection {
  private bound: SyncSession | null = null;
  private currentIndexId: string | null = null;
  private live = false;
  private seq = 0;
  private pumping = false;
  private dirty = false;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    socket: WebSocket,
    identity: ComputerNodeRow,
    readonly mode: SyncMode,
    private readonly left: (connection: SyncConnection) => void,
  ) {
    super(socket, identity);
  }

  get session(): SyncSession | null {
    return this.bound;
  }

  get indexId(): string | null {
    return this.currentIndexId;
  }

  get sentSeq(): number {
    return this.seq;
  }

  bind(session: SyncSession, indexId: string): void {
    this.bound = session;
    this.currentIndexId = indexId;
    this.greeted();
  }

  advance(seq: number): void {
    this.seq = seq;
  }

  goLive(): void {
    this.live = true;
  }

  claimPump(): boolean {
    if (!this.live) return false;
    if (this.pumping) {
      this.dirty = true;
      return false;
    }
    this.pumping = true;
    return true;
  }

  startRound(): void {
    this.dirty = false;
  }

  hasMoreWaiting(): boolean {
    return this.dirty;
  }

  releasePump(): void {
    this.pumping = false;
  }

  enqueue(task: () => Promise<void>, failed: (cause: unknown) => void): void {
    this.tail = this.tail.then(task).catch(failed);
  }

  deliver(message: SyncHubMessage): Promise<void> {
    const text = JSON.stringify(SYNC_HUB_MESSAGE.parse(message));
    return new Promise<void>((resolve, reject) => {
      this.socket.send(text, (error) => {
        if (error instanceof Error) reject(error);
        else resolve();
      });
    });
  }

  protected detach(): void {
    this.left(this);
  }
}

export class SyncRegistry {
  private readonly byRoot = new Map<string, Set<SyncConnection>>();

  add(rootId: string, connection: SyncConnection): void {
    const set = this.byRoot.get(rootId) ?? new Set<SyncConnection>();
    set.add(connection);
    this.byRoot.set(rootId, set);
  }

  remove(connection: SyncConnection): void {
    const rootId = connection.session?.rootId;
    if (rootId === undefined) return;
    const set = this.byRoot.get(rootId);
    set?.delete(connection);
    if (set?.size === 0) this.byRoot.delete(rootId);
  }

  of(rootId: string): readonly SyncConnection[] {
    return [...(this.byRoot.get(rootId) ?? [])];
  }

  ofPlacement(placementId: string): readonly SyncConnection[] {
    return [...this.byRoot.values()]
      .flatMap((set) => [...set])
      .filter((connection) => connection.session?.placementId === placementId);
  }
}
