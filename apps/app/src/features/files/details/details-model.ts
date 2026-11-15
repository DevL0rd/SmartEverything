import type { IconName } from '../../../components/icon';
import { ValueStore, useValue } from '../../../design/external-store';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { isTextNode } from '../quick-look/quick-look-model';
import type { FileAbilities } from '../source/abilities';
import { extensionOf } from '../source/node';
import { DEFAULT_TAB } from './tab-memory';
import { nodeAllows } from '../source/ops';
import type { FileNode, FileNodeKind, SourceTabSpec } from '../source/types';

export const BUILTIN_TABS = ['preview', 'info'] as const;

export type BuiltinTab = (typeof BUILTIN_TABS)[number];

export const TAB_LABEL: Readonly<Record<BuiltinTab, string>> = {
  preview: 'Preview',
  info: 'Info',
};

const TAB_ICON: Readonly<Record<BuiltinTab, IconName>> = {
  preview: 'eye',
  info: 'info',
};

export interface DetailsTabItem {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
}

type TabAbilities = Pick<FileAbilities, 'details' | 'quickLook'>;

export function tabsOf(
  node: Pick<FileNode, 'kind'>,
  abilities: TabAbilities,
  sourceTabs: readonly Pick<SourceTabSpec, 'id' | 'label' | 'icon'>[],
): readonly DetailsTabItem[] {
  if (!abilities.details) return [];
  const preview = node.kind !== 'folder' && abilities.quickLook.includes(node.kind);
  return [
    ...(preview ? [{ key: 'preview', label: TAB_LABEL.preview, icon: TAB_ICON.preview }] : []),
    { key: 'info', label: TAB_LABEL.info, icon: TAB_ICON.info },
    ...sourceTabs
      .filter((tab) => tab.id !== 'preview' && tab.id !== 'info')
      .map((tab) => ({ key: tab.id, label: tab.label, icon: tab.icon })),
  ];
}

export function activeTabOf(remembered: string, tabs: readonly DetailsTabItem[]): string {
  return tabs.some((tab) => tab.key === remembered) ? remembered : DEFAULT_TAB;
}

export interface SubjectContext<N> {
  readonly focused: N | null;
  readonly picked: readonly N[];
  readonly folder: N | null;
}

export function subjectOf<N>(context: SubjectContext<N>): N | null {
  return context.focused ?? context.picked.at(-1) ?? context.folder;
}

export type DetailsPresentation = 'docked' | 'sheet' | 'pull-up';

export const DOCK_FROM = 1024;

export function presentationOf(
  layout: 'compact' | 'icon' | 'wide',
  windowWidth: number,
): DetailsPresentation {
  if (layout === 'compact') return 'pull-up';
  return windowWidth >= DOCK_FROM ? 'docked' : 'sheet';
}

export const DETAILS_WIDTH = { initial: 360, min: 320, max: 560 } as const;

const paneWidth = new ValueStore<number>(DETAILS_WIDTH.initial);

export function setPaneWidth(width: number): void {
  paneWidth.set(width);
}

export function usePaneWidth(): number {
  return useValue(paneWidth);
}

const KIND_WORD: Readonly<Record<FileNodeKind, string>> = {
  folder: 'folder',
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document',
  archive: 'archive',
  link: 'link',
  special: 'special file',
  other: 'file',
};

function capitalised(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

export function kindTextOf(node: Pick<FileNode, 'kind' | 'name'>): string {
  const word = KIND_WORD[node.kind];
  if (node.kind === 'folder' || node.kind === 'link' || node.kind === 'special') {
    return capitalised(word);
  }
  const extension = extensionOf(node.name);
  return extension === null ? capitalised(word) : `${extension.toUpperCase()} ${word}`;
}

export function sizeTextOf(node: Pick<FileNode, 'kind' | 'name' | 'size'>): string {
  return joinParts([kindTextOf(node), node.size === null ? null : bytes(node.size)]);
}

export function previewableOf(node: Pick<FileNode, 'kind'>, thumb: string | null): boolean {
  return (node.kind === 'image' || node.kind === 'video') && thumb !== null;
}

export type PreviewBody = 'picture' | 'sheet' | 'text' | 'none';

export const PREVIEW_HEAD_BYTES = 8 * 1024;

const SHEET_DELIMITER: Readonly<Record<string, string>> = {
  'text/csv': ',',
  'text/tab-separated-values': '\t',
  csv: ',',
  tsv: '\t',
};

type Described = Pick<FileNode, 'kind' | 'mime' | 'name'>;

export function sheetDelimiterOf(node: Described): string | null {
  if (node.kind === 'folder') return null;
  const byMime = node.mime === null ? undefined : SHEET_DELIMITER[node.mime];
  return byMime ?? SHEET_DELIMITER[extensionOf(node.name) ?? ''] ?? null;
}

export function previewBodyOf(node: Described, thumb: string | null): PreviewBody {
  if (node.kind === 'folder' || node.kind === 'link' || node.kind === 'special') return 'none';
  if (sheetDelimiterOf(node) !== null) return 'sheet';
  if (isTextNode(node)) return 'text';
  return thumb === null ? 'none' : 'picture';
}

export function headLinesOf(text: string, whole: boolean): readonly string[] {
  const lines = text.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  if (!whole || lines.at(-1) === '') lines.pop();
  return lines;
}

function cellsOf(line: string, delimiter: string): readonly string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (quoted && char === '"' && line.charAt(index + 1) === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

export interface SheetHead {
  readonly columns: number;
  readonly rows: readonly (readonly string[])[];
}

export function sheetHeadOf(lines: readonly string[], delimiter: string): SheetHead {
  const rows = lines.map((line) => cellsOf(line, delimiter));
  return { columns: rows.reduce((most, row) => Math.max(most, row.length), 0), rows };
}

export function columnNameOf(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return index < 26 ? letter : `${columnNameOf(Math.floor(index / 26) - 1)}${letter}`;
}

export type QuickAction = 'preview' | 'star' | 'chat' | 'download' | 'trash';

type QuickAbilities = Pick<
  FileAbilities,
  'details' | 'quickLook' | 'star' | 'attach' | 'download' | 'trash'
>;

export function quickActionsOf(node: FileNode, abilities: QuickAbilities): readonly QuickAction[] {
  const file = node.kind !== 'folder';
  const exportable = file && node.exportable;
  const preview = tabsOf(node, abilities, []).some((tab) => tab.key === 'preview');
  return [
    ...(preview ? (['preview'] as const) : []),
    ...(abilities.star ? (['star'] as const) : []),
    ...(exportable && abilities.attach ? (['chat'] as const) : []),
    ...(exportable && abilities.download ? (['download'] as const) : []),
    ...(abilities.trash && nodeAllows('trash', node) ? (['trash'] as const) : []),
  ];
}
