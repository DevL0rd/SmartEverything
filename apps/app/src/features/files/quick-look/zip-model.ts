import type { DriveZipEntry, DriveZipTotals } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count } from '../../../format/number';
import { joinParts, naturalCompare } from '../../../format/text';
import type { FileNode } from '../source/types';

function counted(value: number, one: string): string {
  return `${count(value)} ${value === 1 ? one : `${one}s`}`;
}

export interface ZipNode {
  readonly path: string;
  readonly name: string;
  readonly folder: boolean;
  readonly entry: DriveZipEntry | null;
  readonly bytes: number;
  readonly compressedBytes: number;
  readonly files: number;
  readonly children: readonly ZipNode[];
}

export interface ZipRow {
  readonly node: ZipNode;
  readonly depth: number;
  readonly open: boolean;
  readonly share: number;
}

export type ZipOpen = 'image' | 'video' | 'audio' | 'text' | 'locked' | 'none';

interface Building {
  readonly path: string;
  readonly name: string;
  entry: DriveZipEntry | null;
  folder: boolean;
  readonly children: Map<string, Building>;
}

function trimmed(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

function partsOf(path: string): readonly string[] {
  return trimmed(path)
    .split('/')
    .filter((part) => part !== '');
}

function building(path: string, name: string): Building {
  return { path, name, entry: null, folder: true, children: new Map() };
}

function place(top: Building, entry: DriveZipEntry): void {
  const parts = partsOf(entry.path);
  let at = top;
  parts.forEach((part, index) => {
    const path = parts.slice(0, index + 1).join('/');
    const last = index === parts.length - 1;
    const existing = at.children.get(part);
    const next = existing ?? building(path, part);
    if (existing === undefined) at.children.set(part, next);
    if (last) {
      next.entry = entry;
      next.folder = entry.folder;
    }
    at = next;
  });
}

function byFolderThenName(first: ZipNode, second: ZipNode): number {
  if (first.folder !== second.folder) return first.folder ? -1 : 1;
  return naturalCompare(first.name, second.name);
}

function finished(node: Building): ZipNode {
  const children = [...node.children.values()].map(finished).sort(byFolderThenName);
  if (!node.folder) {
    return {
      path: node.path,
      name: node.name,
      folder: false,
      entry: node.entry,
      bytes: node.entry?.bytes ?? 0,
      compressedBytes: node.entry?.compressedBytes ?? 0,
      files: 1,
      children: [],
    };
  }
  return {
    path: node.path,
    name: node.name,
    folder: true,
    entry: node.entry,
    bytes: children.reduce((sum, child) => sum + child.bytes, 0),
    compressedBytes: children.reduce((sum, child) => sum + child.compressedBytes, 0),
    files: children.reduce((sum, child) => sum + child.files, 0),
    children,
  };
}

export function zipTreeOf(entries: readonly DriveZipEntry[]): readonly ZipNode[] {
  const top = building('', '');
  for (const entry of entries) {
    if (partsOf(entry.path).length > 0) place(top, entry);
  }
  return finished(top).children;
}

function flatten(
  nodes: readonly ZipNode[],
  expanded: ReadonlySet<string>,
  depth: number,
  out: { node: ZipNode; depth: number; open: boolean }[],
): void {
  for (const node of nodes) {
    const open = node.folder && expanded.has(node.path);
    out.push({ node, depth, open });
    if (open) flatten(node.children, expanded, depth + 1, out);
  }
}

export function zipRowsOf(
  tree: readonly ZipNode[],
  expanded: ReadonlySet<string>,
): readonly ZipRow[] {
  const rows: { node: ZipNode; depth: number; open: boolean }[] = [];
  flatten(tree, expanded, 0, rows);
  const largest = rows.reduce((most, row) => Math.max(most, row.node.bytes), 0);
  return rows.map((row) => ({ ...row, share: largest === 0 ? 0 : row.node.bytes / largest }));
}

export function toggled(expanded: ReadonlySet<string>, path: string): ReadonlySet<string> {
  const next = new Set(expanded);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  return next;
}

export function firstExpanded(tree: readonly ZipNode[]): ReadonlySet<string> {
  const only = tree.length === 1 ? tree[0] : undefined;
  return only?.folder === true ? new Set([only.path]) : new Set();
}

const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  'txt',
  'md',
  'markdown',
  'log',
  'csv',
  'tsv',
  'json',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'ts',
  'tsx',
  'jsx',
  'py',
  'sh',
  'sql',
  'srt',
  'vtt',
]);

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'avif',
  'svg',
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

type FileKind = Exclude<DriveZipEntry['kind'], 'folder'>;

const OPEN_BY_KIND: Readonly<Record<FileKind, (extension: string) => ZipOpen>> = {
  image: (extension) => (IMAGE_EXTENSIONS.has(extension) ? 'image' : 'none'),
  video: () => 'video',
  audio: () => 'audio',
  document: (extension) => (TEXT_EXTENSIONS.has(extension) ? 'text' : 'none'),
  other: (extension) => (TEXT_EXTENSIONS.has(extension) ? 'text' : 'none'),
  link: () => 'none',
  special: () => 'none',
};

export function zipOpenOf(entry: DriveZipEntry): ZipOpen {
  if (entry.kind === 'folder') return 'none';
  if (entry.encrypted) return 'locked';
  return OPEN_BY_KIND[entry.kind](extensionOf(entry.name));
}

const ZIP_MIMES: ReadonlySet<string> = new Set(['application/zip', 'application/x-zip-compressed']);

export function isZipNode(node: Pick<FileNode, 'kind' | 'mime' | 'name'>): boolean {
  if (node.kind === 'folder') return false;
  return (
    (node.mime !== null && ZIP_MIMES.has(node.mime.toLowerCase())) ||
    extensionOf(node.name) === 'zip'
  );
}

export function isTextName(name: string): boolean {
  return TEXT_EXTENSIONS.has(extensionOf(name));
}

export function zipHeadlineOf(totals: DriveZipTotals): string {
  return joinParts([
    'Archive',
    counted(totals.files, 'file'),
    totals.folders === 0 ? null : counted(totals.folders, 'folder'),
    `${bytes(totals.bytes)} unpacked`,
  ]);
}

export function packedLineOf(totals: DriveZipTotals): string | null {
  if (totals.bytes === 0) return null;
  const saved = 1 - totals.compressedBytes / totals.bytes;
  if (saved <= 0) return `${bytes(totals.compressedBytes)} packed, not compressed`;
  return `${bytes(totals.compressedBytes)} packed, ${String(Math.round(saved * 100))}% smaller`;
}

const KIND_SEGMENTS: readonly {
  readonly kind: FileKind;
  readonly label: string;
  readonly colour: ColourRole;
}[] = [
  { kind: 'image', label: 'Images', colour: 'viz-1' },
  { kind: 'video', label: 'Videos', colour: 'viz-2' },
  { kind: 'audio', label: 'Audio', colour: 'viz-3' },
  { kind: 'document', label: 'Documents', colour: 'viz-4' },
  { kind: 'other', label: 'Other', colour: 'viz-5' },
];

export interface ZipSegment {
  readonly label: string;
  readonly value: number;
  readonly colour: ColourRole;
}

export function zipSegmentsOf(entries: readonly DriveZipEntry[]): readonly ZipSegment[] {
  const sums = new Map<FileKind, number>();
  for (const entry of entries) {
    if (entry.kind !== 'folder') sums.set(entry.kind, (sums.get(entry.kind) ?? 0) + entry.bytes);
  }
  return KIND_SEGMENTS.flatMap((segment) => {
    const value = sums.get(segment.kind) ?? 0;
    return value === 0 ? [] : [{ label: segment.label, value, colour: segment.colour }];
  });
}

export function zipRowCaptionOf(node: ZipNode): string {
  if (node.folder) return joinParts([counted(node.files, 'file'), bytes(node.bytes)]);
  if (node.entry?.encrypted === true) return joinParts([bytes(node.bytes), 'Password protected']);
  return bytes(node.bytes);
}
