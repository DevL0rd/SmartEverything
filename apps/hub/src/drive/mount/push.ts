import type { DriveFeedRow, DriveItem } from '@smarteverything/domain';
import { itemAccess } from '../access';
import type { PosixScope } from '../posix/env';
import type { Store } from '../../store/store';
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
  readonly item: DriveItem | undefined;
  readonly spot: Spot | undefined;
  readonly previous: Spot | undefined;
}

export class PushPump {
  readonly ledger: PushLedger;
  private readonly memo = new Map<number, Resolved>();
  private readonly repathed = new Map<string, { readonly rootId: string; readonly seq: number }>();

  constructor(private readonly store: PushStore) {
    this.ledger = new PushLedger(store);
  }

  private baseOf(scope: PosixScope): string | null {
    return scope.baseId === null
      ? null
      : (this.store.driveItems.find(scope.baseId, null)?.relPath ?? null);
  }

  private resolve(row: DriveFeedRow): Resolved {
    const known = this.memo.get(row.seq);
    if (known !== undefined) return known;
    const item = this.store.driveItems.find(row.itemId, null);
    const spot = item === undefined ? undefined : this.ledger.spotOf(item);
    const resolved = {
      rootId: row.rootId,
      item,
      spot,
      previous: this.ledger.swap(row.itemId, spot),
    };
    this.memo.set(row.seq, resolved);
    if (item?.kind === 'folder' && (row.op === 'rename' || row.op === 'move')) {
      this.repathed.set(item.id, { rootId: row.rootId, seq: row.seq });
    }
    return resolved;
  }

  settle(rootId: string, upTo: number): void {
    for (const [seq, resolved] of this.memo) {
      if (resolved.rootId === rootId && seq <= upTo) this.memo.delete(seq);
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
      const own = row.via === 'mount' && row.deviceId === session.nodeId;
      const { item, spot, previous } = this.resolve(row);
      if (own || SKIPPED.has(row.op)) continue;
      if (item === undefined || spot === undefined) {
        this.gone(change, previous, base);
      } else if (
        inside(base, spot.relPath) &&
        itemAccess(this.store, scope.caller, root, item) !== 'none'
      ) {
        const inherited = item.parentId !== null && this.repathed.has(item.parentId);
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
