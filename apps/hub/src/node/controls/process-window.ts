import {
  appendTo,
  processKey,
  type ProcessRow,
  type ProcessRowUpdate,
  type ProcessSort,
  type ProcessWindow,
  type ProcessesUpdate,
} from '@smarteverything/domain';

const LAUNCHER_PARENTS = 2;

export type Arrangement = Pick<ProcessWindow, 'sort' | 'order' | 'tree'> & {
  readonly search?: string | undefined;
};

type Compare = (a: ProcessRow, b: ProcessRow) => number;

const NUMERIC: Readonly<
  Record<Exclude<ProcessSort, 'name' | 'user'>, (row: ProcessRow) => number>
> = {
  cpu: (row) => row.cpu,
  memory: (row) => row.memoryBytes,
  disk: (row) => row.diskRate,
  gpu: (row) => row.gpu ?? -1,
  threads: (row) => row.threads,
  pid: (row) => row.pid,
};

function text(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparer(sort: ProcessSort, order: ProcessWindow['order']): Compare {
  const direction = order === 'ascending' ? 1 : -1;
  const by = (a: ProcessRow, b: ProcessRow): number => {
    if (sort === 'name') {
      return text(a.name.toLowerCase(), b.name.toLowerCase());
    }
    if (sort === 'user') {
      return text(a.user, b.user);
    }
    return NUMERIC[sort](a) - NUMERIC[sort](b);
  };
  return (a, b) => direction * by(a, b) || a.pid - b.pid;
}

export function defaultOrder(sort: ProcessSort): ProcessWindow['order'] {
  return sort === 'name' || sort === 'user' || sort === 'pid' ? 'ascending' : 'descending';
}

function matches(row: ProcessRow, search: string): boolean {
  const needle = search.toLowerCase();
  return (
    String(row.pid) === needle ||
    row.name.toLowerCase().includes(needle) ||
    row.command.toLowerCase().includes(needle)
  );
}

function summed(row: ProcessRow, below: readonly ProcessRow[]): ProcessRow {
  if (below.length === 0) {
    return row;
  }
  const gpus = [row, ...below].flatMap((item) => (item.gpu === null ? [] : [item.gpu]));
  return {
    ...row,
    cpu: below.reduce((sum, item) => sum + item.cpu, row.cpu),
    memoryBytes: below.reduce((sum, item) => sum + item.memoryBytes, row.memoryBytes),
    diskRate: below.reduce((sum, item) => sum + item.diskRate, row.diskRate),
    threads: below.reduce((sum, item) => sum + item.threads, row.threads),
    gpu:
      gpus.length === 0
        ? null
        : Math.min(
            100,
            gpus.reduce((sum, value) => sum + value, 0),
          ),
    descendants: below.length,
  };
}

function isRoot(row: ProcessRow, byPid: ReadonlyMap<number, ProcessRow>): boolean {
  const parent = byPid.get(row.ppid);
  return parent === undefined || parent.pid <= LAUNCHER_PARENTS || parent.name === 'systemd';
}

interface Node {
  readonly original: ProcessRow;
  readonly row: ProcessRow;
  readonly flat: readonly ProcessRow[];
  readonly raw: readonly ProcessRow[];
}

function build(
  original: ProcessRow,
  children: ReadonlyMap<number, readonly ProcessRow[]>,
  visited: Set<number>,
  compare: Compare,
): Node {
  visited.add(original.pid);
  const nodes = (children.get(original.pid) ?? [])
    .filter((child) => !visited.has(child.pid))
    .map((child) => build(child, children, visited, compare))
    .sort((a, b) => compare(a.row, b.row));
  const raw = nodes.flatMap((node) => [node.original, ...node.raw]);
  const row = summed(original, raw);
  return { original, row, raw, flat: [row, ...nodes.flatMap((node) => node.flat)] };
}

function flatten(rows: readonly ProcessRow[], compare: Compare): ProcessRow[] {
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const children = new Map<number, ProcessRow[]>();
  for (const row of rows) {
    if (!isRoot(row, byPid)) {
      appendTo(children, row.ppid, row);
    }
  }
  const visited = new Set<number>();
  const roots = rows
    .filter((row) => isRoot(row, byPid))
    .map((row) => build(row, children, visited, compare));
  const stray = rows
    .filter((row) => !visited.has(row.pid))
    .map((row) => build(row, children, visited, compare));
  return [...roots, ...stray].sort((a, b) => compare(a.row, b.row)).flatMap((node) => node.flat);
}

export function arrange(rows: readonly ProcessRow[], arrangement: Arrangement): ProcessRow[] {
  const compare = comparer(arrangement.sort, arrangement.order);
  const search = arrangement.search;
  if (search !== undefined) {
    return rows.filter((row) => matches(row, search)).sort(compare);
  }
  return arrangement.tree ? flatten(rows, compare) : [...rows].sort(compare);
}

const CPU_TOLERANCE = 0.3;
const GPU_TOLERANCE = 1;
const MEMORY_TOLERANCE_BYTES = 1_048_576;
const DISK_TOLERANCE_BYTES = 1024;
const DISK_TOLERANCE_SHARE = 0.1;

function moved(a: number | null, b: number | null, tolerance: number): boolean {
  if (a === null || b === null) {
    return a !== b;
  }
  return Math.abs(a - b) >= tolerance;
}

function stateClass(row: ProcessRow): ProcessRow['state'] {
  return row.state === 'running' ? 'sleeping' : row.state;
}

export function differs(before: ProcessRow, now: ProcessRow): boolean {
  const diskTolerance = Math.max(
    DISK_TOLERANCE_BYTES,
    DISK_TOLERANCE_SHARE * Math.max(before.diskRate, now.diskRate),
  );
  return (
    before.threads !== now.threads ||
    before.descendants !== now.descendants ||
    stateClass(before) !== stateClass(now) ||
    moved(before.cpu, now.cpu, CPU_TOLERANCE) ||
    moved(before.memoryBytes, now.memoryBytes, MEMORY_TOLERANCE_BYTES) ||
    moved(before.gpu, now.gpu, GPU_TOLERANCE) ||
    moved(before.diskRate, now.diskRate, diskTolerance)
  );
}

function updateOf(before: ProcessRow | undefined, row: ProcessRow): ProcessRowUpdate {
  if (before === undefined) {
    return row;
  }
  const { ppid, name, command, user, ...live } = row;
  return {
    ...live,
    ...(ppid === before.ppid ? {} : { ppid }),
    ...(name === before.name ? {} : { name }),
    ...(command === before.command ? {} : { command }),
    ...(user === before.user ? {} : { user }),
  };
}

export class WindowDiff {
  private sent = new Map<string, ProcessRow>();
  private order = '';
  private shape = '';

  next(
    visible: readonly ProcessRow[],
    shape: { readonly total: number; readonly offset: number },
    key: boolean,
  ): ProcessesUpdate | null {
    const keys = visible.map(processKey);
    const kept = new Map<string, ProcessRow>();
    const rows: ProcessRowUpdate[] = [];
    visible.forEach((row, index) => {
      const id = keys[index] ?? '';
      const before = this.sent.get(id);
      if (!key && before !== undefined && !differs(before, row)) {
        kept.set(id, before);
        return;
      }
      kept.set(id, row);
      rows.push(key ? row : updateOf(before, row));
    });
    const order = keys.join(',');
    const shaped = `${String(shape.total)}:${String(shape.offset)}`;
    const unchanged = rows.length === 0 && order === this.order && shaped === this.shape;
    this.sent = kept;
    this.order = order;
    this.shape = shaped;
    return unchanged && !key
      ? null
      : { total: shape.total, offset: shape.offset, order: keys, rows };
  }
}
