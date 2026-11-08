export const SYNC_PATH_REFUSALS = [
  'empty',
  'absolute',
  'nul',
  'dot_segment',
  'empty_segment',
  'not_nfc',
  'reserved_name',
  'trailing_dot_or_space',
  'illegal_character',
] as const;

export type SyncPathRefusal = (typeof SYNC_PATH_REFUSALS)[number];

export interface SyncPathPolicy {
  readonly portable: boolean;
}

export type SyncPathCheck =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly refusal: SyncPathRefusal };

const RESERVED = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/iu;
const ILLEGAL = /[<>:"\\|?*]/u;

function hasControl(segment: string): boolean {
  for (const char of segment) {
    if ((char.codePointAt(0) ?? 0) < 0x20) return true;
  }
  return false;
}

export function normalizeSyncPath(path: string): string {
  return path.normalize('NFC');
}

function baseRefusal(path: string): SyncPathRefusal | null {
  if (path === '') return 'empty';
  if (path.includes('\u0000')) return 'nul';
  if (path.startsWith('/')) return 'absolute';
  if (path !== normalizeSyncPath(path)) return 'not_nfc';
  for (const segment of path.split('/')) {
    if (segment === '') return 'empty_segment';
    if (segment === '.' || segment === '..') return 'dot_segment';
  }
  return null;
}

function segmentRefusal(segment: string): SyncPathRefusal | null {
  if (ILLEGAL.test(segment) || hasControl(segment)) return 'illegal_character';
  if (/[. ]$/u.test(segment)) return 'trailing_dot_or_space';
  const stem = segment.split('.')[0] ?? '';
  return RESERVED.test(stem.trimEnd()) ? 'reserved_name' : null;
}

function portableRefusal(path: string): SyncPathRefusal | null {
  for (const segment of path.split('/')) {
    const refusal = segmentRefusal(segment);
    if (refusal !== null) return refusal;
  }
  return null;
}

export function checkSyncPath(path: string, policy: SyncPathPolicy): SyncPathCheck {
  const refusal = baseRefusal(path) ?? (policy.portable ? portableRefusal(path) : null);
  return refusal === null ? { ok: true, path } : { ok: false, refusal };
}

export function foldSyncPath(path: string): string {
  return normalizeSyncPath(path).toLowerCase();
}

export function caseCollisions(paths: Iterable<string>): readonly (readonly string[])[] {
  const groups = new Map<string, Set<string>>();
  for (const path of paths) {
    const key = foldSyncPath(path);
    groups.set(key, (groups.get(key) ?? new Set<string>()).add(path));
  }
  return [...groups.values()].filter((group) => group.size > 1).map((group) => [...group]);
}

export function collidesWith(path: string, existing: Iterable<string>): string | null {
  const key = foldSyncPath(path);
  for (const other of existing) {
    if (other !== path && foldSyncPath(other) === key) return other;
  }
  return null;
}
