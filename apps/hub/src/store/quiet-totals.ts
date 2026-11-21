import type { DriveRoot, RowChange } from '@smarteverything/domain';

export const DRIVE_TOTALS_QUIET_MS = 2000;

type RootChange = Extract<RowChange, { readonly table: 'drive_roots' }>;

interface TotalsChange {
  readonly change: RootChange;
  readonly record: DriveRoot;
  readonly oldRecord: DriveRoot;
}

interface Held {
  readonly first: DriveRoot;
  readonly last: TotalsChange;
  readonly timer: NodeJS.Timeout;
}

function withoutTotals(root: DriveRoot): string {
  const { items: _items, folders: _folders, bytes: _bytes, ...rest } = root;
  return JSON.stringify(rest);
}

function sameTotals(left: DriveRoot, right: DriveRoot): boolean {
  return left.items === right.items && left.folders === right.folders && left.bytes === right.bytes;
}

function totalsChangeOf(change: RowChange): TotalsChange | null {
  if (change.table !== 'drive_roots' || change.operation !== 'UPDATE') return null;
  const { record, oldRecord } = change;
  if (record === null || oldRecord === null || sameTotals(record, oldRecord)) return null;
  if (withoutTotals(record) !== withoutTotals(oldRecord)) return null;
  return { change, record, oldRecord };
}

function rootIdOf(change: RowChange): string | null {
  if (change.table !== 'drive_roots') return null;
  if (change.record !== null) return change.record.id;
  return change.oldRecord === null ? null : change.oldRecord.id;
}

export class QuietTotals {
  private readonly held = new Map<string, Held>();

  constructor(
    private readonly quietMs: number,
    private readonly deliver: (change: RowChange) => void,
  ) {}

  hold(change: RowChange): boolean {
    const totals = totalsChangeOf(change);
    if (totals === null) return false;
    const rootId = totals.record.id;
    const held = this.held.get(rootId);
    if (held !== undefined) clearTimeout(held.timer);
    const timer = setTimeout(() => {
      this.settle(rootId);
    }, this.quietMs);
    timer.unref();
    this.held.set(rootId, {
      first: held === undefined ? totals.oldRecord : held.first,
      last: totals,
      timer,
    });
    return true;
  }

  settleFor(change: RowChange): void {
    const rootId = rootIdOf(change);
    if (rootId !== null) this.settle(rootId);
  }

  settleAll(): void {
    for (const rootId of [...this.held.keys()]) this.settle(rootId);
  }

  private settle(rootId: string): void {
    const held = this.held.get(rootId);
    if (held === undefined) return;
    clearTimeout(held.timer);
    this.held.delete(rootId);
    if (sameTotals(held.first, held.last.record)) return;
    this.deliver({ ...held.last.change, oldRecord: held.first });
  }
}
