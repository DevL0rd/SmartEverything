import type { DriveFeedRow } from '@smarteverything/domain';
import { nodeScopeOf } from '../posix/nodes';
import type { PushRow } from '../units/mount';
import type { Store } from '../../store/store';
import type { DriveItemSpot } from '../../store/repositories/drive-item-lookups';
import { pushFrame } from './frames';
import type { Attachment, MountSession } from './session';

export type PushStore = Pick<Store, 'host'>;

export interface Spot {
  readonly ino: number;
  readonly parent: number;
  readonly name: string;
  readonly relPath: string;
}

const BATCH_ROWS = 200;

const SKIPPED = new Set<string>(['star', 'unstar']);

class Change {
  readonly inodes = new Set<number>();
  readonly entries = new Map<string, readonly [number, string]>();
  readonly removed = new Set<number>();
  private forgotten = false;

  get reset(): boolean {
    return this.forgotten;
  }

  forgetAll(): void {
    this.forgotten = true;
  }

  at(spot: Spot): void {
    this.entries.set(`${String(spot.parent)}\0${spot.name}`, [spot.parent, spot.name]);
    this.inodes.add(spot.parent);
  }

  get empty(): boolean {
    return this.entries.size === 0 && this.inodes.size === 0 && this.removed.size === 0;
  }
}

export class PushLedger {
  private readonly spots = new Map<string, Spot>();

  constructor(private readonly store: PushStore) {}

  async note(rootId: string, relPath: string): Promise<void> {
    const noted = await this.store.host.read('driveMountSpot', { rootId, relPath });
    if (noted === null) return;
    const { itemId, ...spot } = noted;
    this.spots.set(itemId, spot);
  }

  swap(itemId: string, spot: Spot | undefined): Spot | undefined {
    const previous = this.spots.get(itemId);
    if (spot === undefined) this.spots.delete(itemId);
    else this.spots.set(itemId, spot);
    return previous;
  }
}

class Pumping {
  private wanted = false;
  done: Promise<void> = Promise.resolve();

  ask(): void {
    this.wanted = true;
  }

  take(): boolean {
    const wanted = this.wanted;
    this.wanted = false;
    return wanted;
  }
}

function inside(base: string | null, relPath: string): boolean {
  return base === null || relPath === base || relPath.startsWith(`${base}/`);
}

interface Resolved {
  readonly rootId: string;
  readonly itemId: string;
  readonly parentId: string | null;
  readonly spot: Spot | undefined;
  readonly previous: Spot | undefined;
}

function spotOf(placed: DriveItemSpot): Spot {
  return { ino: placed.ino, parent: placed.parent, name: placed.name, relPath: placed.relPath };
}

function ownSince(session: MountSession, row: DriveFeedRow): boolean {
  return row.via === 'mount' && row.deviceId === session.nodeId && row.seq > session.echoOwnThrough;
}

export class PushPump {
  readonly ledger: PushLedger;
  private readonly memo = new Map<string, Map<number, Resolved>>();
  private readonly settledUpTo = new Map<string, number>();
  private readonly repathed = new Map<string, { readonly rootId: string; readonly seq: number }>();
  private readonly pumping = new Map<Attachment, Pumping>();

  constructor(private readonly store: PushStore) {
    this.ledger = new PushLedger(store);
  }

  private memoOf(rootId: string): Map<number, Resolved> {
    let memo = this.memo.get(rootId);
    if (memo === undefined) {
      memo = new Map();
      this.memo.set(rootId, memo);
    }
    return memo;
  }

  private resolve({ row, placed }: PushRow): Resolved {
    const memo = this.memoOf(row.rootId);
    const known = memo.get(row.seq);
    if (known !== undefined) return known;
    const resolved = this.placedRow(row, placed);
    const settled = this.settledUpTo.get(row.rootId);
    if (settled === undefined || row.seq > settled) memo.set(row.seq, resolved);
    if (placed?.kind === 'folder' && (row.op === 'rename' || row.op === 'move')) {
      this.repathed.set(row.itemId, { rootId: row.rootId, seq: row.seq });
    }
    return resolved;
  }

  private placedRow(row: DriveFeedRow, placed: DriveItemSpot | undefined): Resolved {
    const spot = placed === undefined ? undefined : spotOf(placed);
    return {
      rootId: row.rootId,
      itemId: row.itemId,
      parentId: placed === undefined ? null : placed.parentId,
      spot,
      previous: this.ledger.swap(row.itemId, spot),
    };
  }

  settle(rootId: string, upTo: number): void {
    const settled = this.settledUpTo.get(rootId);
    if (settled === undefined || upTo > settled) this.settledUpTo.set(rootId, upTo);
    const memo = this.memo.get(rootId);
    if (memo !== undefined) {
      for (const seq of memo.keys()) {
        if (seq > upTo) break;
        memo.delete(seq);
      }
      if (memo.size === 0) this.memo.delete(rootId);
    }
    for (const [itemId, mark] of this.repathed) {
      if (mark.rootId === rootId && mark.seq <= upTo) this.repathed.delete(itemId);
    }
  }

  private fold(
    session: MountSession,
    base: string | null,
    rows: readonly PushRow[],
  ): { readonly change: Change; readonly vanished: Spot[] } {
    const change = new Change();
    const vanished: Spot[] = [];
    for (const entry of rows) {
      const { row } = entry;
      const { parentId, spot, previous } = this.resolve(entry);
      if (ownSince(session, row) || SKIPPED.has(row.op)) continue;
      if (entry.state === 'gone' || spot === undefined) {
        this.gone(change, previous, base, vanished);
      } else if (inside(base, spot.relPath) && entry.state === 'visible') {
        const inherited = parentId !== null && this.repathed.has(parentId);
        this.live(change, {
          spot,
          previous,
          base,
          reset: this.unplaced(row.op, previous, inherited),
        });
      }
    }
    return { change, vanished };
  }

  private live(
    change: Change,
    seen: { spot: Spot; previous: Spot | undefined; base: string | null; reset: boolean },
  ): void {
    const { spot, previous } = seen;
    change.inodes.add(spot.ino);
    change.at(spot);
    if (previous === undefined) {
      if (seen.reset) change.forgetAll();
      return;
    }
    const moved = previous.parent !== spot.parent || previous.name !== spot.name;
    if (moved && inside(seen.base, previous.relPath)) change.at(previous);
  }

  private unplaced(op: string, previous: Spot | undefined, inherited: boolean): boolean {
    return previous === undefined && !inherited && (op === 'rename' || op === 'move');
  }

  private gone(
    change: Change,
    previous: Spot | undefined,
    base: string | null,
    vanished: Spot[],
  ): void {
    if (previous === undefined) {
      change.forgetAll();
      return;
    }
    if (!inside(base, previous.relPath)) return;
    change.at(previous);
    vanished.push(previous);
  }

  private async sortVanished(change: Change, vanished: readonly Spot[]): Promise<void> {
    if (vanished.length === 0) return;
    const ids = [...new Set(vanished.map((spot) => spot.ino))];
    const kept = await this.store.host.call('driveInodes', 'findMany', ids);
    const live = new Set(kept.map((inode) => inode.id));
    for (const spot of vanished) {
      if (live.has(spot.ino)) change.inodes.add(spot.ino);
      else change.removed.add(spot.ino);
    }
  }

  pump(session: MountSession, attachment: Attachment): Promise<void> {
    const running = this.pumping.get(attachment);
    if (running !== undefined) {
      running.ask();
      return running.done;
    }
    const state = new Pumping();
    this.pumping.set(attachment, state);
    state.done = this.drain(session, attachment, state).finally(() => {
      this.pumping.delete(attachment);
    });
    return state.done;
  }

  private async drain(
    session: MountSession,
    attachment: Attachment,
    state: Pumping,
  ): Promise<void> {
    do {
      let more = true;
      while (more && session.link !== null) more = await this.round(session, attachment);
    } while (state.take());
  }

  private async round(session: MountSession, attachment: Attachment): Promise<boolean> {
    const { scope } = attachment;
    const root = scope.drive.id;
    const window = await this.store.host.read('driveMountPushWindow', {
      rootId: root,
      after: attachment.sentSeq,
      limit: BATCH_ROWS,
      baseId: scope.baseId,
      caller: nodeScopeOf(scope).caller,
    });
    if (attachment.sentSeq > window.latest) {
      attachment.advance(window.latest);
      session.link?.send(pushFrame('RESET', { root, seq: window.latest }));
      return false;
    }
    const last = window.rows.at(-1)?.row;
    if (last === undefined) return false;
    const { change, vanished } = this.fold(session, window.base, window.rows);
    await this.sortVanished(change, vanished);
    attachment.advance(last.seq);
    if (change.reset) {
      session.link?.send(pushFrame('RESET', { root, seq: last.seq }));
    } else if (!change.empty) {
      session.link?.send(
        pushFrame('CHANGED', {
          root,
          seq: last.seq,
          inodes: [...change.inodes],
          entries: [...change.entries.values()],
          removed: [...change.removed],
        }),
      );
    }
    return window.rows.length === BATCH_ROWS;
  }
}
