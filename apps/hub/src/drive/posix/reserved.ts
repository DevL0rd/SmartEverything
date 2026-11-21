import { LOCKED_FOLDER } from '../access';
import { ORPHAN_DIRECTORY } from '../paths';
import { MARKER_DIRECTORY } from '../root-marker';

const RESERVED = new Set<string>([MARKER_DIRECTORY, ORPHAN_DIRECTORY, LOCKED_FOLDER]);

export function isReservedPath(relPath: string): boolean {
  const first = relPath.split('/', 1)[0];
  return first !== undefined && RESERVED.has(first);
}
