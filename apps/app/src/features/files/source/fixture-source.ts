import { appendTo, type DriveZipEntry, type DriveZipTotals } from '@smarteverything/domain';
import { ValueStore, useValue } from '../../../design/external-store';
import { bytes } from '../../../format/number';
import { filterWordsOf, matchRangesOf } from '../browser/filter-model';
import { sortNodes } from '../browser/sort-model';
import type { FileAbilities } from './abilities';
import {
  ancestorsOf,
  applyOp,
  childrenOf,
  descendantsOf,
  folderKeyOf,
  nodeOfEntry,
  treeOf,
  type FixtureEntry,
  type FixtureNode,
  type FixtureOrigin,
  type FixtureTree,
} from './fixture-tree';
import { opAllowed, opTargetsLocation, refusedOf, type FileOp, type OpResult } from './ops';
import type {
  FileCrumb,
  FileLinks,
  FileLocation,
  FilePlace,
  FileSearch,
  FileSortOrder,
  FileSource,
  FolderListing,
  InfoRow,
  PreparedDownload,
  SearchMatch,
  SearchQuery,
  UploadHandle,
  UploadJob,
  UploadTransport,
  ZipListing,
} from './types';

export interface FixtureSeed {
  readonly id: string;
  readonly label: string;
  readonly places: readonly FilePlace[];
  readonly entries: readonly FixtureEntry[];
  readonly trashed?: readonly FixtureEntry[];
  readonly abilities: (location: FileLocation) => FileAbilities;
}

export interface FixtureSource extends FileSource<FixtureOrigin> {
  readonly tree: ValueStore<FixtureTree>;
  readonly listing: (location: FileLocation) => readonly FixtureNode[];
  readonly abilitiesAt: (location: FileLocation) => FileAbilities;
}

const BY_NAME = (): string | null => null;

function placeOf(seed: FixtureSeed, location: FileLocation): FilePlace | undefined {
  return seed.places.find((place) => place.key === location.place);
}

function listingOf(
  seed: FixtureSeed,
  tree: FixtureTree,
  location: FileLocation,
): readonly FixtureNode[] {
  if (placeOf(seed, location)?.kind === 'trash') {
    return [...tree.trashed.values()].map((entry) => entry.node);
  }
  return childrenOf(tree, folderKeyOf(location));
}

function withinPlace(ancestors: readonly FixtureNode[], placeKey: string): readonly FixtureNode[] {
  const root = ancestors.findIndex((node) => node.key === placeKey);
  return root === -1 ? ancestors : ancestors.slice(root + 1);
}

function crumbsOf(
  seed: FixtureSeed,
  tree: FixtureTree,
  location: FileLocation,
): readonly FileCrumb<FixtureOrigin>[] {
  const place = placeOf(seed, location);
  const root: FileCrumb<FixtureOrigin>[] =
    place === undefined ? [] : [{ key: place.key, label: place.label, location: place.location }];
  if (location.folder === null) return root;
  return [
    ...root,
    ...withinPlace(ancestorsOf(tree, location.folder), location.place).map((node) => ({
      key: node.key,
      label: node.name,
      location: { place: location.place, folder: node.key },
    })),
  ];
}

function folderListing(
  seed: FixtureSeed,
  tree: FixtureTree,
  location: FileLocation,
  sort: FileSortOrder,
): FolderListing<FixtureOrigin> {
  const entries = sortNodes(listingOf(seed, tree, location), sort, BY_NAME);
  return {
    entries,
    folder: location.folder === null ? null : (tree.nodes.get(location.folder) ?? null),
    crumbs: crumbsOf(seed, tree, location),
    total: entries.length,
    complete: true,
    loading: false,
    stale: false,
    error: null,
    more: null,
    retry: () => undefined,
  };
}

export function searchOf(
  nodes: readonly FixtureNode[],
  query: SearchQuery,
): readonly SearchMatch<FixtureOrigin>[] {
  const words = filterWordsOf(query.text);
  if (words.length === 0) return [];
  return nodes.flatMap((node): SearchMatch<FixtureOrigin>[] => {
    const ranges = matchRangesOf(node.name, words);
    if (ranges !== null)
      return [{ node, hit: { where: 'name', snippet: null, line: null, ranges } }];
    const text = query.contents ? node.origin.text : null;
    const inText = text === null ? null : matchRangesOf(text, words);
    if (text === null || inText === null) return [];
    return [{ node, hit: { where: 'text', snippet: text, line: 1, ranges: inText } }];
  });
}

function fixtureUpload(tree: ValueStore<FixtureTree>): UploadTransport {
  return {
    conflicts: 'number',
    serial: false,
    start: (job: UploadJob, progress): UploadHandle => {
      const parentKey = folderKeyOf(job.folder);
      const key = `${parentKey}/${job.name}`;
      tree.update((current) => {
        const nodes = new Map(current.nodes);
        nodes.set(
          key,
          nodeOfEntry({
            key,
            parentKey,
            name: job.name,
            mime: job.file.mime,
            size: job.file.bytes,
          }),
        );
        return { ...current, nodes };
      });
      progress(job.file.bytes);
      return {
        outcome: Promise.resolve({ kind: 'done', name: job.name, renamed: false }),
        pause: () => Promise.resolve(),
        resume: () => undefined,
        cancel: () => Promise.resolve(),
      };
    },
  };
}

function downloadOf(nodes: readonly FixtureNode[]): Promise<PreparedDownload> {
  const [only] = nodes;
  const zip = nodes.length !== 1 || only?.kind === 'folder';
  const name = zip ? 'Download.zip' : (only?.name ?? 'Download');
  const total = nodes.reduce((sum, node) => sum + (node.size ?? 0), 0);
  const url = `fixture://download/${nodes.map((node) => node.key).join(',')}`;
  return Promise.resolve({
    url,
    download: {
      kind: zip ? 'zip' : 'file',
      name,
      size: zip ? null : total,
      files: nodes.filter((node) => node.kind !== 'folder').length,
      folders: nodes.filter((node) => node.kind === 'folder').length,
      bytes: total,
      skipped: [],
      url,
      expiresAt: '2026-11-14T11:00:00.000Z',
    },
  });
}

function linksOf(node: FixtureNode): FileLinks {
  const file = `fixture://file/${node.key}`;
  return {
    file: node.kind === 'folder' ? null : file,
    thumb: node.kind === 'image' ? `fixture://thumb/${node.key}` : null,
    download: node.exportable && node.kind !== 'folder' ? file : null,
    icon: node.marks.iconHint ? `fixture://icon/${node.key}` : null,
  };
}

function zipTotalsOf(entries: readonly DriveZipEntry[]): DriveZipTotals {
  const files = entries.filter((entry) => !entry.folder);
  return {
    files: files.length,
    folders: entries.length - files.length,
    bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    compressedBytes: files.reduce((sum, entry) => sum + entry.compressedBytes, 0),
  };
}

function zipOf(node: FixtureNode | null): ZipListing {
  const entries = node?.origin.zip ?? [];
  return {
    entries,
    totals: entries.length === 0 ? null : zipTotalsOf(entries),
    loading: false,
    error: null,
    more: null,
    entryLink: (index) => Promise.resolve(`fixture://zip/${node?.key ?? ''}/${String(index)}`),
  };
}

function infoOf(node: FixtureNode): readonly InfoRow[] {
  return [
    { key: 'kind', label: 'Kind', value: node.kind },
    ...(node.size === null ? [] : [{ key: 'size', label: 'Size', value: bytes(node.size) }]),
  ];
}

function opLocation(seed: FixtureSeed, op: FileOp<FixtureOrigin>): FileLocation {
  const target = opTargetsLocation(op);
  if (target !== null) return target;
  const inTrash = op.kind === 'restore' || op.kind === 'delete_now';
  const place = seed.places.find((candidate) => (candidate.kind === 'trash') === inTrash);
  const first = op.kind === 'rename' ? op.node : op.kind === 'new_folder' ? null : op.nodes[0];
  return { place: place?.key ?? '', folder: inTrash ? null : (first?.parentKey ?? null) };
}

type Run = (op: FileOp<FixtureOrigin>) => Promise<OpResult>;

function movesBack(nodes: readonly FixtureNode[], place: string): readonly FileOp<FixtureOrigin>[] {
  const back = new Map<string | null, FixtureNode[]>();
  for (const node of nodes) appendTo(back, node.parentKey, node);
  return [...back].map(([folder, moved]): FileOp<FixtureOrigin> => ({
    kind: 'move',
    nodes: moved,
    to: { place, folder },
  }));
}

function undoStepsOf(
  op: FileOp<FixtureOrigin>,
  before: FixtureTree,
  after: FixtureTree,
  done: readonly string[],
): readonly FileOp<FixtureOrigin>[] {
  if (op.kind === 'new_folder' || op.kind === 'rename') return [];
  const acted = op.nodes.filter((node) => done.includes(node.key));
  if (acted.length === 0) return [];
  if (op.kind === 'trash') return [{ kind: 'restore', nodes: acted }];
  if (op.kind === 'move') return movesBack(acted, op.to.place);
  if (op.kind !== 'copy') return [];
  const copies = [...after.nodes.values()].filter((node) => !before.nodes.has(node.key));
  return [{ kind: 'trash', nodes: copies }];
}

function runOf(seed: FixtureSeed, tree: ValueStore<FixtureTree>): Run {
  const run: Run = (op) => {
    if (!opAllowed(op, seed.abilities(opLocation(seed, op)))) {
      return Promise.resolve(refusedOf(op, 'This can’t be done here.'));
    }
    const before = tree.get();
    const applied = applyOp(before, op);
    tree.set(applied.tree);
    const steps = undoStepsOf(op, before, applied.tree, applied.result.done);
    if (steps.length === 0) return Promise.resolve(applied.result);
    return Promise.resolve({
      ...applied.result,
      undo: async (): Promise<OpResult> => {
        const results = await Promise.all(steps.map(run));
        return {
          done: results.flatMap((result) => result.done),
          failed: results.flatMap((result) => result.failed),
          undo: null,
        };
      },
    });
  };
  return run;
}

function useFixtureSearch(
  tree: ValueStore<FixtureTree>,
  location: FileLocation,
  query: SearchQuery | null,
): FileSearch<FixtureOrigin> {
  const value = useValue(tree);
  const nodes = descendantsOf(value, folderKeyOf(location));
  return {
    matches: query === null ? [] : searchOf(nodes, query),
    scanned: query === null ? null : nodes.length,
    running: false,
    error: null,
    more: null,
    stop: null,
  };
}

export function createFixtureSource(seed: FixtureSeed): FixtureSource {
  const tree = new ValueStore(treeOf(seed.entries, seed.trashed));
  return {
    id: seed.id,
    label: seed.label,
    tree,
    listing: (location) => listingOf(seed, tree.get(), location),
    abilitiesAt: seed.abilities,
    useAbilities: (location) => seed.abilities(location),
    usePlaces: () => seed.places,
    useFolder: (location, sort) => folderListing(seed, useValue(tree), location, sort),
    useSearch: (location, query) => useFixtureSearch(tree, location, query),
    useLinks: linksOf,
    useZip: zipOf,
    useInfo: infoOf,
    infoSections: () => [],
    locationOf: (typed): FileLocation | null => {
      const node = tree.get().nodes.get(typed.trim());
      const place = seed.places[0];
      return node?.kind !== 'folder' || place === undefined
        ? null
        : { place: place.key, folder: node.key };
    },
    run: runOf(seed, tree),
    upload: fixtureUpload(tree),
    download: downloadOf,
    actions: () => [],
    tabs: () => [],
  };
}
