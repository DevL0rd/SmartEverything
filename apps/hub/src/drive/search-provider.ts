import {
  DRIVE_SNIPPET_CLOSE,
  DRIVE_SNIPPET_OPEN,
  type DriveHit as ContentHit,
  type DriveItem,
  type DriveQuery,
  type DriveShortcut,
  type NavTarget,
} from '@smarteverything/domain';
import type { DriveActor } from './access';
import type { DriveSearch } from './search';

export interface DriveHit {
  readonly id: string;
  readonly name: string;
  readonly kind: DriveItem['kind'];
  readonly rootId: string;
  readonly path: string;
  readonly target: NavTarget;
  readonly subtitle?: string;
  readonly shortcut?: true;
}

export interface DriveHitInput {
  readonly query: string;
  readonly limit: number;
}

function directoryOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash < 0 ? '/' : `/${relPath.slice(0, slash)}`;
}

function targetOf(item: DriveItem): NavTarget {
  return item.kind === 'folder'
    ? { kind: 'drive', rootId: item.rootId, path: `/${item.relPath}`, itemId: null, focus: null }
    : {
        kind: 'drive',
        rootId: item.rootId,
        path: directoryOf(item.relPath),
        itemId: item.id,
        focus: null,
      };
}

function plainSnippet(snippet: string): string {
  return snippet.replaceAll(DRIVE_SNIPPET_OPEN, '').replaceAll(DRIVE_SNIPPET_CLOSE, '');
}

function hitOf(item: DriveItem, found: ContentHit | undefined): DriveHit {
  const snippet = found?.snippet ?? null;
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    rootId: item.rootId,
    path: item.relPath,
    target: targetOf(item),
    ...(snippet === null ? {} : { subtitle: plainSnippet(snippet) }),
  };
}

function shortcutHitOf(shortcut: DriveShortcut): DriveHit[] {
  if (shortcut.target.state !== 'available') return [];
  const item = shortcut.target.item;
  return [
    {
      id: shortcut.id,
      name: shortcut.name,
      kind: item.kind,
      rootId: shortcut.rootId,
      path: item.relPath,
      target: targetOf(item),
      shortcut: true,
    },
  ];
}

export type ShortcutHits = (viewer: DriveActor, query: DriveQuery) => DriveShortcut[];

export function driveHits(
  search: Pick<DriveSearch, 'search'>,
  viewer: DriveActor,
  { query, limit }: DriveHitInput,
  shortcuts: ShortcutHits,
): DriveHit[] {
  const request: DriveQuery = {
    text: query,
    match: 'all',
    rootId: null,
    folderId: null,
    kinds: null,
    starred: null,
    duration: null,
    taken: null,
    sort: { field: 'modifiedAt', direction: 'desc' },
    cursor: null,
  };
  const page = search.search(viewer, request, limit);
  const snippets = new Map(page.hits.map((hit) => [hit.itemId, hit]));
  const items = page.items.map((item) => hitOf(item, snippets.get(item.id)));
  const named = shortcuts(viewer, request).flatMap(shortcutHitOf);
  return [...items, ...named].slice(0, limit);
}
