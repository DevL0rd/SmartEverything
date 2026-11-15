import type { Entry } from '../manifest.ts';
import { directoryEntry, entryOf } from './workloads-shared.ts';
import { writerContent } from './two-scripts.ts';

const CONFLICT_NAME =
  /^(?<stem>.+)\.sync-conflict-\d{8}-\d{6}-[A-Za-z0-9]+(?:-\d+)?(?<extension>\.[^.]*)?$/u;

export interface ConflictPair {
  readonly original: string;
  readonly conflict: string;
}

function isConflictOf(conflict: string, original: string): boolean {
  const match = CONFLICT_NAME.exec(conflict);
  const stem = match?.groups?.['stem'];
  const extension = match?.groups?.['extension'] ?? '';
  return stem !== undefined && `${stem}${extension}` === original;
}

export function conflictPair(names: readonly string[], original: string): ConflictPair {
  const sorted = [...names].sort();
  if (!sorted.includes(original))
    throw new Error(
      `The original ${original} is missing; the folder holds [${sorted.join(', ')}].`,
    );
  const others = sorted.filter((name) => name !== original);
  const conflict = others[0];
  if (others.length !== 1 || conflict === undefined)
    throw new Error(
      `Expected ${original} and exactly one conflict copy, the folder holds [${sorted.join(', ')}].`,
    );
  if (!isConflictOf(conflict, original))
    throw new Error(`${conflict} is not a conflict copy of ${original}.`);
  return { original, conflict };
}

export interface WriterLog {
  readonly created: readonly number[];
  readonly refused: readonly number[];
}

export function parseWriterLog(text: string): WriterLog {
  const created: number[] = [];
  const refused: number[] = [];
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const failed = line.startsWith('!');
    const match = /^f(\d+)$/u.exec(failed ? line.slice(1) : line);
    const number = match?.[1];
    if (number === undefined) throw new Error(`The writer log has an unreadable line: ${line}`);
    (failed ? refused : created).push(Number(number));
  }
  return { created, refused };
}

export function renamedFolderEntries(
  folder: string,
  log: WriterLog,
  bigContent: Buffer,
): readonly Entry[] {
  return [
    directoryEntry(folder),
    entryOf(`${folder}/open.bin`, bigContent),
    ...log.created.map((number) => entryOf(`${folder}/f${String(number)}`, writerContent(number))),
  ];
}

export function expectedRowCount(counts: readonly number[]): number {
  return counts.reduce((total, count) => total + count, 0);
}
