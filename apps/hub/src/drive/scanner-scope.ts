import type { DriveItemsRepository } from '../store/repositories/drive-items';
import type { CommitDependencies } from './scanner-commit';
import { indexedOf, under, type Indexed } from './scanner-index';
import { WALK_BATCH_ROWS } from './scanner-walk';

type IndexReader = Pick<CommitDependencies, 'items' | 'inodes'>;

export class ScanOrderError extends Error {
  override readonly name = 'ScanOrderError';

  constructor(readonly relPath: string) {
    super(`The scan reached ${relPath} before its folder.`);
  }
}

export function indexedAt(deps: IndexReader, rootId: string, relPath: string): Indexed | undefined {
  const item = deps.items.byPath(rootId, relPath, null);
  if (item === undefined) return undefined;
  const inode = deps.inodes.ofItem(item.id);
  if (inode === undefined) throw new Error(`The indexed item at ${relPath} has no inode row.`);
  return indexedOf({ item, identity: deps.items.identityOf(item.id), inodeId: inode.id }, inode);
}

export function* indexedChildren(
  deps: IndexReader,
  rootId: string,
  parentId: string | null,
): Generator<Indexed> {
  let after: string | null = null;
  do {
    const window = deps.items.children({
      rootId,
      parentId,
      after,
      limit: WALK_BATCH_ROWS,
      viewer: null,
    });
    const inodes = new Map(
      deps.inodes
        .findMany(window.entries.map((entry) => entry.inodeId))
        .map((inode) => [inode.id, inode]),
    );
    for (const entry of window.entries) yield indexedOf(entry, inodes.get(entry.inodeId));
    after = window.next;
  } while (after !== null);
}

export function parentPathOf(relPath: string): string | null {
  const slash = relPath.lastIndexOf('/');
  return slash === -1 ? null : relPath.slice(0, slash);
}

function liftedScope(
  items: Pick<DriveItemsRepository, 'byPath'>,
  rootId: string,
  relPath: string,
): string {
  let scope = relPath;
  for (
    let parent = parentPathOf(scope);
    parent !== null && items.byPath(rootId, parent, null)?.kind !== 'folder';
    parent = parentPathOf(scope)
  ) {
    scope = parent;
  }
  return scope;
}

export function scopesOf(
  items: Pick<DriveItemsRepository, 'byPath'>,
  rootId: string,
  relPaths: readonly string[],
): string[] {
  const lifted = [...new Set(relPaths.map((relPath) => liftedScope(items, rootId, relPath)))];
  const scopes: string[] = [];
  for (const scope of lifted.sort((left, right) => left.length - right.length)) {
    if (!scopes.some((kept) => under(scope, kept))) scopes.push(scope);
  }
  return scopes;
}
