import type { KeyPress } from '../../../design/keyboard';
import { count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { moment } from '../../../format/time';
import { rememberTab } from '../details/tab-memory';
import type { FileAbilities } from '../source/abilities';
import { captionOf, extensionOf } from '../source/node';
import type { FileNode, FileNodeKind, FileSource } from '../source/types';
import { isTextName, isZipNode } from './zip-model';

export interface QuickLookTarget<O> {
  readonly source: FileSource<O>;
  readonly abilities: FileAbilities;
  readonly nodes: readonly FileNode<O>[];
  readonly focused: FileNode<O> | null;
  readonly close: () => void;
  readonly focus: (node: FileNode<O>) => void;
  readonly details: ((node: FileNode<O>) => void) | null;
}

type Stepped = Pick<FileNode, 'key' | 'kind'>;

export interface QuickLookPlace<N extends Stepped> {
  readonly position: number | null;
  readonly total: number;
  readonly previous: N | null;
  readonly next: N | null;
}

export type QuickLookContent =
  'folder' | 'image' | 'video' | 'audio' | 'text' | 'zip' | 'picture' | 'none';

export type QuickLookKey = 'previous' | 'next' | 'close';

const SHOWN_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'image/svg+xml',
]);

const SHOWN_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg']);

const TEXT_MIMES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/x-sh',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/sql',
  'application/x-ndjson',
]);

const KEYS: Readonly<Record<string, QuickLookKey>> = {
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  ' ': 'close',
};

function isFile(node: Stepped): boolean {
  return node.kind !== 'folder';
}

function nearest<N extends Stepped>(nodes: readonly N[], from: number, by: 1 | -1): N | null {
  for (let at = from + by; at >= 0 && at < nodes.length; at += by) {
    const node = nodes[at];
    if (node !== undefined && isFile(node)) return node;
  }
  return null;
}

export function placeOf<N extends Stepped>(nodes: readonly N[], current: N): QuickLookPlace<N> {
  const files = nodes.filter(isFile);
  const at = nodes.findIndex((node) => node.key === current.key);
  const position = files.findIndex((node) => node.key === current.key);
  return {
    position: position === -1 ? null : position + 1,
    total: files.length,
    previous: at === -1 ? null : nearest(nodes, at, -1),
    next: at === -1 ? null : nearest(nodes, at, 1),
  };
}

export function stepOf<N extends Stepped>(
  nodes: readonly N[],
  current: N,
  direction: 'previous' | 'next',
): N | null {
  const place = placeOf(nodes, current);
  return direction === 'next' ? place.next : place.previous;
}

export function positionText(place: QuickLookPlace<Stepped>): string | null {
  if (place.position === null || place.total < 2) return null;
  return `${count(place.position)} of ${count(place.total)}`;
}

export function isTextMime(mime: string): boolean {
  const type = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    type.startsWith('text/') ||
    type.endsWith('+json') ||
    type.endsWith('+xml') ||
    TEXT_MIMES.has(type)
  );
}

type Described = Pick<FileNode, 'kind' | 'mime' | 'name'>;

export function isTextNode(node: Described): boolean {
  if (node.kind === 'folder') return false;
  return node.mime === null
    ? isTextName(node.name)
    : isTextMime(node.mime) || isTextName(node.name);
}

export function showsImageFile(node: Described): boolean {
  if (node.mime !== null) return SHOWN_IMAGE_MIMES.has(node.mime.toLowerCase());
  return SHOWN_IMAGE_EXTENSIONS.has(extensionOf(node.name) ?? '');
}

export interface ContentFacts {
  readonly kinds: readonly FileNodeKind[];
  readonly zipContents: boolean;
  readonly thumb: boolean;
}

export function contentFactsOf(
  abilities: Pick<FileAbilities, 'quickLook' | 'zipContents'>,
  thumb: string | null,
): ContentFacts {
  return { kinds: abilities.quickLook, zipContents: abilities.zipContents, thumb: thumb !== null };
}

function documentContent(node: Described, facts: ContentFacts): QuickLookContent {
  if (facts.zipContents && isZipNode(node)) return 'zip';
  if (isTextNode(node)) return 'text';
  return facts.thumb ? 'picture' : 'none';
}

type ContentOfKind = (node: Described, facts: ContentFacts) => QuickLookContent;

const CONTENT_BY_KIND: Readonly<Record<Exclude<FileNodeKind, 'folder'>, ContentOfKind>> = {
  image: (node, facts) => (facts.thumb || showsImageFile(node) ? 'image' : 'none'),
  video: () => 'video',
  audio: () => 'audio',
  document: documentContent,
  archive: documentContent,
  other: documentContent,
  link: () => 'none',
  special: () => 'none',
};

export function contentOf(node: Described, facts: ContentFacts): QuickLookContent {
  if (node.kind === 'folder') return 'folder';
  if (!facts.kinds.includes(node.kind)) return 'none';
  return CONTENT_BY_KIND[node.kind](node, facts);
}

const KIND_LABEL: Readonly<Record<FileNodeKind, string>> = {
  folder: 'Folder',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
  archive: 'Archive',
  link: 'Link',
  special: 'Special file',
  other: 'File',
};

export function kindLabelOf(node: Pick<FileNode, 'kind' | 'name'>): string {
  if (node.kind === 'folder' || node.kind === 'link' || node.kind === 'special') {
    return KIND_LABEL[node.kind];
  }
  return extensionOf(node.name)?.toUpperCase() ?? KIND_LABEL[node.kind];
}

export function quickLookCaption(node: FileNode, now: number): string {
  return joinParts([
    kindLabelOf(node),
    captionOf(node),
    node.modifiedAt === null ? null : `changed ${moment(node.modifiedAt, now)}`,
  ]);
}

export function quickLookKeyFor(press: KeyPress): QuickLookKey | null {
  if (press.typing || press.command || press.alt || press.shift) return null;
  return KEYS[press.key] ?? null;
}

export function detailsOnInfo<N>(
  details: ((node: N) => void) | null,
  node: N,
): (() => void) | null {
  if (details === null) return null;
  return (): void => {
    rememberTab('info');
    details(node);
  };
}
