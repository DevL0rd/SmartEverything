import type { DriveFeedRow, DriveItem } from '@smarteverything/domain';
import { itemAccess } from '../access';
import type { PosixScope } from '../posix/env';
import type { Store } from '../../store/store';
import type { DriveItemSpot } from '../../store/repositories/drive-item-lookups';
import { pushFrame } from './frames';
import type { Attachment, MountSession } from './session';

export type PushStore = Pick<
  Store,
  'driveFeed' | 'driveItems' | 'driveInodes' | 'driveRoots' | 'driveGrants'
>;

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

  spotOf(item: DriveItem): Spot | undefined {
    const inode = this.store.driveInodes.ofItem(item.id);
    if (inode === undefined) return undefined;
    const parent =
      item.parentId === null
        ? this.store.driveInodes.rootOf(item.rootId)
        : this.store.driveInodes.ofItem(item.parentId);
    if (parent === undefined) return undefined;
    return { ino: inode.id, parent: parent.id, name: item.name, relPath: item.relPath };
  }

  note(rootId: string, relPath: string): void {
    const item = this.store.driveItems.byPath(rootId, relPath, null);
    if (item === undefined) return;
    const spot = this.spotOf(item);
    if (spot !== undefined) this.spots.set(item.id, spot);
  }

  swap(itemId: string, spot: Spot | undefined): Spot | undefined {
    const previous = this.spots.get(itemId);
    if (spot === undefined) this.spots.delete(itemId);
    else this.spots.set(itemId, spot);
    return previous;
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

  constructor(private readonly store: PushStore) {
    this.ledger = new PushLedger(store);
  }

  private baseOf(scope: PosixScope): string | null {
    return scope.baseId === null
      ? null
      : (this.store.driveItems.find(scope.baseId, null)?.relPath ?? null);
  }

  private memoOf(rootId: string): Map<number, Resolved> {
    let memo = this.memo.get(rootId);
    if (memo === undefined) {
      memo = new Map();
      this.memo.set(rootId, memo);
    }
    return memo;
  }

  private resolve(row: DriveFeedRow): Resolved {
    const memo = this.memoOf(row.rootId);
    const known = memo.get(row.seq);
    if (known !== undefined) return known;
    const placed = this.store.driveItems.lookups.spot(row.itemId);
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

  private fold(session: MountSession, scope: PosixScope, rows: readonly DriveFeedRow[]): Change {
    const change = new Change();
    const base = this.baseOf(scope);
    const root = this.store.driveRoots.byId(scope.drive.id);
    for (const row of rows) {
      const { itemId, parentId, spot, previous } = this.resolve(row);
      if (ownSince(session, row) || SKIPPED.has(row.op)) continue;
      const item = spot === undefined ? undefined : this.store.driveItems.find(itemId, null);
      if (item === undefined || spot === undefined) {
        this.gone(change, previous, base);
      } else if (
        inside(base, spot.relPath) &&
        itemAccess(this.store, scope.caller, root, item) !== 'none'
      ) {
        const inherited = parentId !== null && this.repathed.has(parentId);
        this.live(change, {
          spot,
          previous,
          base,
          reset: this.unplaced(row.op, previous, inherited),
        });
      }
    }
    return change;
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

  private gone(change: Change, previous: Spot | undefined, base: string | null): void {
    if (previous === undefined) {
      change.forgetAll();
      return;
    }
    if (!inside(base, previous.relPath)) return;
    change.at(previous);
    if (this.store.driveInodes.find(previous.ino) === undefined) change.removed.add(previous.ino);
    else change.inodes.add(previous.ino);
  }

  pump(session: MountSession, attachment: Attachment): void {
    let more = true;
    while (more && session.link !== null) more = this.round(session, attachment);
  }

  private round(session: MountSession, attachment: Attachment): boolean {
    const { scope } = attachment;
    const root = scope.drive.id;
    const latest = this.store.driveFeed.latestSeqInRoot(root);
    if (attachment.sentSeq > latest) {
      attachment.advance(latest);
      session.link?.send(pushFrame('RESET', { root, seq: latest }));
      return false;
    }
    const window = this.store.driveFeed.sinceInRoot(root, attachment.sentSeq, BATCH_ROWS);
    const last = window.rows.at(-1);
    if (last === undefined) return false;
    const change = this.fold(session, scope, window.rows);
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
