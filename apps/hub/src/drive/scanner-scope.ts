import type { DriveItemsRepository } from '../store/repositories/drive-items';
import type { CommitDependencies } from './scanner-commit';
import { indexedOf, under, type Indexed } from './scanner-index';
import { stepBudget } from './scan-steps';
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

export interface IndexedWindow {
  readonly indexed: readonly Indexed[];
  readonly next: string | null;
}

export function indexedWindow(
  deps: IndexReader,
  rootId: string,
  parentId: string | null,
  after: string | null,
): IndexedWindow {
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
  return {
    indexed: window.entries.map((entry) => indexedOf(entry, inodes.get(entry.inodeId))),
    next: window.next,
  };
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

interface Pending {
  readonly parentId: string | null;
  readonly after: string | null;
}

export interface IndexSink {
  readonly anchor: (indexed: Indexed) => void;
  readonly note: (indexed: Indexed) => void;
}

export class IndexLoader {
  private readonly pending: Pending[] = [];

  constructor(
    private readonly deps: IndexReader,
    private readonly rootId: string,
    scopes: readonly string[] | null,
    private readonly sink: IndexSink,
  ) {
    if (scopes === null) this.pending.push({ parentId: null, after: null });
    else for (const scope of scopes) this.seed(scope);
  }

  step(): boolean {
    const within = stepBudget();
    for (
      let next = this.pending.pop();
      next !== undefined;
      next = within() ? this.pending.pop() : undefined
    ) {
      this.window(next);
    }
    return this.pending.length > 0;
  }

  private seed(scope: string): void {
    const parent = parentPathOf(scope);
    if (parent !== null) {
      const anchor = indexedAt(this.deps, this.rootId, parent);
      if (anchor?.kind !== 'folder') throw new ScanOrderError(scope);
      this.sink.anchor(anchor);
    }
    const indexed = indexedAt(this.deps, this.rootId, scope);
    if (indexed === undefined) return;
    this.noted(indexed);
  }

  private window(pending: Pending): void {
    const window = indexedWindow(this.deps, this.rootId, pending.parentId, pending.after);
    for (const indexed of window.indexed) this.noted(indexed);
    if (window.next !== null) this.pending.push({ parentId: pending.parentId, after: window.next });
  }

  private noted(indexed: Indexed): void {
    this.sink.note(indexed);
    if (indexed.kind === 'folder') this.pending.push({ parentId: indexed.id, after: null });
  }
}
