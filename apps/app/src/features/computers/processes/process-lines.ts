import { processKey, type ProcessRow } from '@smarteverything/domain';
import { passesFilter, type ProcessFilter } from './process-sort';

export interface ProcessLine {
  readonly key: string;
  readonly row: ProcessRow;
  readonly depth: number;
  readonly open: boolean | null;
}

const LAUNCHER_PARENTS = 2;
const INIT_PID = 1;
const OPEN_BY_DEFAULT = 5;

function isLauncher(row: ProcessRow): boolean {
  return row.pid <= LAUNCHER_PARENTS || (row.name === 'systemd' && row.ppid === INIT_PID);
}

export function depthsOf(rows: readonly ProcessRow[]): readonly number[] {
  const stack: ProcessRow[] = [];
  return rows.map((row) => {
    for (let top = stack.at(-1); top !== undefined; top = stack.at(-1)) {
      if (top.pid === row.ppid && !isLauncher(top)) break;
      stack.pop();
    }
    const depth = stack.length;
    stack.push(row);
    return depth;
  });
}

export function treeLines(
  rows: readonly ProcessRow[],
  isOpen: (key: string) => boolean,
): readonly ProcessLine[] {
  const depths = depthsOf(rows);
  const lines: ProcessLine[] = [];
  let collapsedAt: number | null = null;
  rows.forEach((row, index) => {
    const depth = depths[index] ?? 0;
    if (collapsedAt !== null && depth > collapsedAt) return;
    collapsedAt = null;
    const key = processKey(row);
    const hasKids = (depths[index + 1] ?? 0) > depth;
    const open = hasKids ? isOpen(key) : null;
    if (open === false) collapsedAt = depth;
    lines.push({ key, row, depth, open });
  });
  return lines;
}

export function flatLines(
  rows: readonly ProcessRow[],
  filter: ProcessFilter,
): readonly ProcessLine[] {
  return rows
    .filter((row) => passesFilter(filter, row))
    .map((row) => ({ key: processKey(row), row, depth: 0, open: null }));
}

export function defaultOpen(rows: readonly ProcessRow[]): ReadonlySet<string> {
  const depths = depthsOf(rows);
  const parents = rows.filter(
    (_row, index) => (depths[index] ?? 0) === 0 && (depths[index + 1] ?? 0) > 0,
  );
  const busiest = [...parents].sort((left, right) => right.cpu - left.cpu);
  return new Set(busiest.slice(0, OPEN_BY_DEFAULT).map(processKey));
}
