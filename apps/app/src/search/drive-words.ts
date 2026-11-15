import type { DriveItem } from '@smarteverything/domain';

const WORD = /[\p{L}\p{N}\p{M}]+/gu;

export function driveWordsOf(query: string): readonly string[] {
  return query.match(WORD) ?? [];
}

const KIND_PHRASES: ReadonlyMap<string, DriveItem['kind']> = new Map([
  ['link', 'link'],
  ['links', 'link'],
  ['symlink', 'link'],
  ['symlinks', 'link'],
  ['symbolic link', 'link'],
  ['symbolic links', 'link'],
  ['special file', 'special'],
  ['special files', 'special'],
  ['fifo', 'special'],
  ['fifos', 'special'],
  ['pipe', 'special'],
  ['pipes', 'special'],
  ['named pipe', 'special'],
  ['named pipes', 'special'],
  ['socket', 'special'],
  ['sockets', 'special'],
  ['device file', 'special'],
  ['device files', 'special'],
]);

export function driveKindOf(query: string): DriveItem['kind'] | null {
  const phrase = driveWordsOf(query.toLowerCase()).join(' ');
  return KIND_PHRASES.get(phrase) ?? null;
}
