import type { Program } from '../program/walk';
import { describeSlot, readersOf, type Site } from './refs';
import { refuse } from './result';

export function describeReader(site: Site, reads: string): string {
  return `"${reads}" is read by ${describeSlot(site.slot)} of ${site.owner === undefined ? 'the program' : `"${site.owner}"`}`;
}

export function guardFreeKeys(program: Program, keys: readonly string[]): void {
  const reader = readersOf(program, new Set(keys))[0];
  if (reader !== undefined) {
    refuse(
      'referenced',
      `${describeReader(reader.site, reader.reads)}, so a new node cannot take that key`,
    );
  }
}
