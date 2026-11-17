import type { EntryMark } from '../../../components/files/entry-row';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import type { FileMarks, FileNode, FileNodeKind } from './types';

export const NO_MARKS: FileMarks = {
  starred: false,
  shared: false,
  locked: false,
  comments: 0,
  offline: null,
  shortcut: null,
  placement: null,
  colour: null,
  iconHint: false,
};

const ARCHIVE_MIMES: ReadonlySet<string> = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-bzip2',
  'application/x-xz',
  'application/zstd',
]);

const DOCUMENT_MIMES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/json',
  'application/xml',
  'application/rtf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/epub+zip',
]);

const DOCUMENT_PREFIXES: readonly string[] = [
  'text/',
  'application/vnd.openxmlformats-officedocument.',
  'application/vnd.oasis.opendocument.',
];

const MEDIA_PREFIXES: readonly (readonly [string, FileNodeKind])[] = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
];

const EXTENSION_KIND: Readonly<Record<string, FileNodeKind>> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  avif: 'image',
  bmp: 'image',
  svg: 'image',
  mp4: 'video',
  mov: 'video',
  mkv: 'video',
  webm: 'video',
  avi: 'video',
  mp3: 'audio',
  m4a: 'audio',
  flac: 'audio',
  wav: 'audio',
  ogg: 'audio',
  opus: 'audio',
  zip: 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  '7z': 'archive',
  rar: 'archive',
  xz: 'archive',
  bz2: 'archive',
  pdf: 'document',
  txt: 'document',
  md: 'document',
  csv: 'document',
  json: 'document',
  doc: 'document',
  docx: 'document',
  xls: 'document',
  xlsx: 'document',
  ppt: 'document',
  pptx: 'document',
  odt: 'document',
  ods: 'document',
};

export function kindOfMime(mime: string): FileNodeKind {
  const media = MEDIA_PREFIXES.find(([prefix]) => mime.startsWith(prefix));
  if (media !== undefined) return media[1];
  if (ARCHIVE_MIMES.has(mime)) return 'archive';
  if (DOCUMENT_MIMES.has(mime)) return 'document';
  return DOCUMENT_PREFIXES.some((prefix) => mime.startsWith(prefix)) ? 'document' : 'other';
}

export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  return dot <= 0 || dot === name.length - 1 ? null : name.slice(dot + 1).toLowerCase();
}

export function kindOfFile(mime: string | null, name: string): FileNodeKind {
  const byMime = mime === null ? 'other' : kindOfMime(mime);
  if (byMime !== 'other') return byMime;
  const extension = extensionOf(name);
  return extension === null ? 'other' : (EXTENSION_KIND[extension] ?? 'other');
}

export function isFolder(node: Pick<FileNode, 'kind'>): boolean {
  return node.kind === 'folder';
}

export function keysOf(nodes: readonly Pick<FileNode, 'key'>[]): readonly string[] {
  return nodes.map((node) => node.key);
}

export function itemsLine(items: number): string {
  return `${count(items)} ${items === 1 ? 'item' : 'items'}`;
}

export function captionOf(node: FileNode): string | null {
  const unavailable = node.marks.shortcut?.unavailable ?? null;
  if (unavailable !== null) return unavailable;
  if (node.entry !== null) return node.entry.line;
  if (node.kind === 'folder') return folderCaptionOf(node);
  return node.size === null ? null : bytes(node.size);
}

export function filesLine(files: number): string {
  return `${count(files)} ${files === 1 ? 'file' : 'files'}`;
}

function folderCaptionOf(node: FileNode): string | null {
  if (node.files !== null) {
    return joinParts([filesLine(node.files), node.size === null ? null : bytes(node.size)]);
  }
  return node.childCount === null ? null : itemsLine(node.childCount);
}

export function detailLineOf(node: FileNode): string {
  return joinParts([
    captionOf(node),
    node.marks.locked ? 'View only' : null,
    node.writable ? null : 'Read only',
  ]);
}

const OFFLINE_MARK: Readonly<Record<NonNullable<FileMarks['offline']>, EntryMark>> = {
  ready: { key: 'offline', icon: 'circleCheck', tone: 'positive', label: 'Available offline' },
  waiting: { key: 'offline', icon: 'loader', tone: 'variant', label: 'Saving for offline' },
  failed: { key: 'offline', icon: 'warning', tone: 'critical', label: 'Not saved for offline' },
};

const PLACEMENT_MARK: Readonly<Record<NonNullable<FileMarks['placement']>, EntryMark>> = {
  synced: { key: 'placement', icon: 'folderSync', tone: 'info', label: 'Synced to a computer' },
  mounted: { key: 'placement', icon: 'hardDrive', tone: 'info', label: 'Mounted on a computer' },
};

function flagMarks(marks: FileMarks): readonly EntryMark[] {
  const out: EntryMark[] = [];
  if (marks.starred) out.push({ key: 'star', icon: 'star', tone: 'warning', label: 'Starred' });
  if (marks.shared) out.push({ key: 'shared', icon: 'users', tone: 'variant', label: 'Shared' });
  if (marks.locked) out.push({ key: 'locked', icon: 'lock', tone: 'variant', label: 'View only' });
  if (marks.shortcut !== null) {
    out.push({ key: 'shortcut', icon: 'link', tone: 'variant', label: 'Shortcut' });
  }
  return out;
}

export function markListOf(marks: FileMarks): readonly EntryMark[] {
  const out = [...flagMarks(marks)];
  if (marks.comments > 0) {
    const label =
      marks.comments === 1 ? '1 open comment' : `${count(marks.comments)} open comments`;
    out.push({ key: 'comments', icon: 'messageCircle', tone: 'info', label });
  }
  if (marks.placement !== null) out.push(PLACEMENT_MARK[marks.placement]);
  if (marks.offline !== null) out.push(OFFLINE_MARK[marks.offline]);
  return out;
}
