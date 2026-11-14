import type { DriveIntegrity, DriveItem } from '../../../../../packages/domain/src/drive/item';
import type { RootPlan } from './plans';
import { cycle, HISTORY_MS, iso, NOW_MS } from './random';
import type { Random } from './random';

export type FileItem = Exclude<DriveItem, { readonly kind: 'folder' }>;
export type DocumentItem = Extract<DriveItem, { readonly kind: 'document' }>;

export interface ConflictPair {
  readonly original: DocumentItem;
  readonly copy: DocumentItem;
}

export interface BuiltRoot {
  readonly plan: RootPlan;
  readonly items: readonly DriveItem[];
  readonly pairs: readonly ConflictPair[];
}

interface FolderNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly relPath: string;
}

interface Place {
  readonly parentId: string | null;
  readonly relPath: string;
  readonly name: string;
  readonly rev: number;
}

type ImageItem = Extract<DriveItem, { readonly kind: 'image' }>;

type BaseFields = Pick<
  DriveItem,
  | 'id'
  | 'rootId'
  | 'parentId'
  | 'relPath'
  | 'name'
  | 'modifiedAt'
  | 'addedAt'
  | 'openedAt'
  | 'starred'
  | 'shared'
  | 'rev'
  | 'etag'
  | 'outside'
  | 'addedByProfileId'
  | 'remoteId'
  | 'remoteRev'
>;

type MediaFields = Pick<
  ImageItem,
  'takenAt' | 'width' | 'height' | 'orientation' | 'camera' | 'exposure' | 'place'
>;

const FILES_PER_FOLDER = 40;
const HASHED_SHARE = 0.85;
const VERIFIED_SHARE = 0.7;
const CORRUPT_SHARE = 0.001;
const CORRUPT_INDEX = 3;
const OUTSIDE_SHARE = 0.03;
const STARRED_SHARE = 0.05;
const ROOT_LEVEL_SHARE = 0.1;
const FOLDER_NAMES = ['Documents', 'Photos', 'Trips', 'School', 'Work', 'Music', 'Scans'] as const;
const CAMERAS = [
  { make: 'Google', model: 'Pixel 9', lens: 'Main' },
  { make: 'Canon', model: 'EOS R6', lens: 'RF 24-70mm' },
  { make: 'Apple', model: 'iPhone 16', lens: null },
] as const;

const KINDS = [
  {
    kind: 'image',
    weight: 50,
    stem: 'IMG',
    minBytes: 200_000,
    maxBytes: 8_000_000,
    extensions: [
      { ext: 'jpg', mime: 'image/jpeg' },
      { ext: 'heic', mime: 'image/heic' },
      { ext: 'png', mime: 'image/png' },
    ],
  },
  {
    kind: 'video',
    weight: 12,
    stem: 'VID',
    minBytes: 20_000_000,
    maxBytes: 800_000_000,
    extensions: [
      { ext: 'mp4', mime: 'video/mp4' },
      { ext: 'mov', mime: 'video/quicktime' },
    ],
  },
  {
    kind: 'audio',
    weight: 8,
    stem: 'Track',
    minBytes: 3_000_000,
    maxBytes: 40_000_000,
    extensions: [
      { ext: 'mp3', mime: 'audio/mpeg' },
      { ext: 'flac', mime: 'audio/flac' },
    ],
  },
  {
    kind: 'document',
    weight: 20,
    stem: 'Report',
    minBytes: 50_000,
    maxBytes: 5_000_000,
    extensions: [
      { ext: 'pdf', mime: 'application/pdf' },
      {
        ext: 'docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ],
  },
  {
    kind: 'other',
    weight: 10,
    stem: 'Archive',
    minBytes: 10_000,
    maxBytes: 200_000_000,
    extensions: [
      { ext: 'zip', mime: 'application/zip' },
      { ext: 'bin', mime: 'application/octet-stream' },
    ],
  },
] as const;

const KIND_WEIGHT_TOTAL = KINDS.reduce((total, spec) => total + spec.weight, 0);

function pickKind(random: Random): (typeof KINDS)[number] {
  let roll = random.int(KIND_WEIGHT_TOTAL);
  for (const spec of KINDS) {
    if (roll < spec.weight) {
      return spec;
    }
    roll -= spec.weight;
  }
  return KINDS[4];
}

function baseFields(random: Random, plan: RootPlan, place: Place, index: number): BaseFields {
  const { rev, ...where } = place;
  const added = NOW_MS - random.int(HISTORY_MS);
  const modified = random.between(added, NOW_MS);
  const outside = random.chance(OUTSIDE_SHARE);
  return {
    id: random.uuid(),
    rootId: plan.id,
    ...where,
    modifiedAt: iso(modified),
    addedAt: iso(added),
    openedAt: random.chance(0.3) ? iso(random.between(modified, NOW_MS)) : null,
    starred: random.chance(STARRED_SHARE),
    shared: false,
    rev,
    etag: `${String(rev)}-${random.hex(8)}`,
    outside,
    addedByProfileId: outside ? null : cycle(plan.adders, index),
    remoteId: null,
    remoteRev: null,
  };
}

function checksum(
  random: Random,
  index: number,
): { readonly sha256: string | null; readonly integrity: DriveIntegrity } {
  if (index === CORRUPT_INDEX || random.chance(CORRUPT_SHARE)) {
    return { sha256: random.hex(64), integrity: 'corrupt' };
  }
  if (random.chance(HASHED_SHARE)) {
    return { sha256: random.hex(64), integrity: random.chance(VERIFIED_SHARE) ? 'ok' : 'unknown' };
  }
  return { sha256: null, integrity: 'unknown' };
}

function thumbFor(random: Random, kind: FileItem['kind']): FileItem['thumb'] {
  if (kind === 'image' || kind === 'video') {
    const roll = random.next();
    if (roll < 0.9) {
      return { state: 'ready' };
    }
    return roll < 0.95
      ? { state: 'none' }
      : { state: 'failed', reason: 'The decoder rejected the file' };
  }
  return kind === 'document' && random.chance(0.5) ? { state: 'ready' } : { state: 'none' };
}

function coordinate(random: Random, limit: number): number {
  return Math.round((random.next() * 2 - 1) * limit * 10_000) / 10_000;
}

function exposure(random: Random): NonNullable<ImageItem['exposure']> {
  return {
    iso: random.pick([100, 200, 400, 800, 1600]),
    aperture: random.pick([1.8, 2.8, 4]),
    shutter: random.pick([0.001, 0.004, 0.0166]),
    focal: random.pick([24, 35, 50]),
  };
}

function mediaFields(random: Random): MediaFields {
  const width = random.between(640, 6000);
  return {
    takenAt: random.chance(0.9) ? iso(NOW_MS - random.int(HISTORY_MS)) : null,
    width,
    height: Math.round(width * 0.75),
    orientation: random.between(1, 8),
    camera: random.chance(0.85) ? random.pick<(typeof CAMERAS)[number]>(CAMERAS) : null,
    exposure: random.chance(0.7) ? exposure(random) : null,
    place: random.chance(0.4)
      ? { lat: coordinate(random, 90), lon: coordinate(random, 180) }
      : null,
  };
}

function revisionOf(random: Random): number {
  return random.chance(0.7) ? 1 : random.between(2, 6);
}

function durationOf(random: Random): number | null {
  return random.chance(0.9) ? random.between(1000, 7_200_000) : null;
}

function buildFile(
  random: Random,
  plan: RootPlan,
  index: number,
  folder: FolderNode | null,
): FileItem {
  const spec = pickKind(random);
  const extension = random.pick<(typeof spec.extensions)[number]>(spec.extensions);
  const name = `${spec.stem} ${String(index + 1)}.${extension.ext}`;
  const relPath = folder ? `${folder.relPath}/${name}` : name;
  const rev = revisionOf(random);
  const file = {
    ...baseFields(random, plan, { parentId: folder?.id ?? null, relPath, name, rev }, index),
    ...checksum(random, index),
    mime: extension.mime,
    bytes: random.between(spec.minBytes, spec.maxBytes),
    thumb: thumbFor(random, spec.kind),
  };
  const durationMs = durationOf(random);
  switch (spec.kind) {
    case 'image':
      return { ...file, ...mediaFields(random), kind: 'image' };
    case 'video':
      return { ...file, ...mediaFields(random), kind: 'video', durationMs };
    case 'audio':
      return { ...file, kind: 'audio', takenAt: null, durationMs };
    case 'document':
      return { ...file, kind: 'document' };
    case 'other':
      return { ...file, kind: 'other' };
  }
}

function buildFolders(random: Random, files: number): readonly FolderNode[] {
  const total = Math.max(2, Math.ceil(files / FILES_PER_FOLDER));
  const top = Math.max(1, Math.ceil(Math.sqrt(total)));
  const nodes: FolderNode[] = [];
  for (let index = 0; index < total; index += 1) {
    const parent = index < top ? null : (nodes[index % top] ?? null);
    const name = `${random.pick(FOLDER_NAMES)} ${String(index + 1)}`;
    nodes.push({
      id: random.uuid(),
      parentId: parent?.id ?? null,
      name,
      relPath: parent ? `${parent.relPath}/${name}` : name,
    });
  }
  return nodes;
}

function folderTotals(
  nodes: readonly FolderNode[],
  files: readonly FileItem[],
): ReadonlyMap<string, { children: number; bytes: number }> {
  const tally = new Map<string, { children: number; bytes: number }>();
  for (const node of nodes) {
    tally.set(node.id, { children: 0, bytes: 0 });
  }
  for (const file of files) {
    const entry = file.parentId === null ? undefined : tally.get(file.parentId);
    if (entry) {
      entry.children += 1;
      entry.bytes += file.bytes;
    }
  }
  for (const node of nodes) {
    const parent = node.parentId === null ? undefined : tally.get(node.parentId);
    if (parent) {
      parent.children += 1;
      parent.bytes += tally.get(node.id)?.bytes ?? 0;
    }
  }
  return tally;
}

function folderItems(
  random: Random,
  plan: RootPlan,
  nodes: readonly FolderNode[],
  files: readonly FileItem[],
): readonly DriveItem[] {
  const tally = folderTotals(nodes, files);
  return nodes.map((node, index): DriveItem => {
    const totals = tally.get(node.id) ?? { children: 0, bytes: 0 };
    const place = { parentId: node.parentId, relPath: node.relPath, name: node.name, rev: 1 };
    return {
      ...baseFields(random, plan, place, index),
      id: node.id,
      kind: 'folder',
      childCount: totals.children,
      bytes: totals.bytes,
    };
  });
}

function conflictCopy(random: Random, original: DocumentItem): DocumentItem {
  const dot = original.name.lastIndexOf('.');
  const tag = random.hex(7).toUpperCase();
  const name = `${original.name.slice(0, dot)}.sync-conflict-20261105-101500-${tag}${original.name.slice(dot)}`;
  const directory = original.relPath.slice(0, original.relPath.length - original.name.length);
  return {
    ...original,
    id: random.uuid(),
    name,
    relPath: `${directory}${name}`,
    rev: 1,
    etag: `1-${random.hex(8)}`,
    openedAt: null,
    starred: false,
  };
}

export function buildRoot(random: Random, plan: RootPlan, files: number): BuiltRoot {
  const nodes = files === 0 ? [] : buildFolders(random, files);
  const list: FileItem[] = [];
  for (let index = 0; index < files; index += 1) {
    const folder = random.chance(ROOT_LEVEL_SHARE)
      ? null
      : (nodes[random.int(nodes.length)] ?? null);
    list.push(buildFile(random, plan, index, folder));
  }
  const originals = list.filter((file) => file.kind === 'document').slice(0, plan.conflicts);
  const pairs = originals.map((original) => ({ original, copy: conflictCopy(random, original) }));
  const all = [...list, ...pairs.map((pair) => pair.copy)];
  return { plan, items: [...folderItems(random, plan, nodes, all), ...all], pairs };
}
