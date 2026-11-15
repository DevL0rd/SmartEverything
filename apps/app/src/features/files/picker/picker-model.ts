import type { IconName } from '../../../components/icon';
import type { FileAbilities } from '../source/abilities';
import { plural } from '../../../format/text';
import { captionOf } from '../source/node';
import type { OpResult } from '../source/ops';
import type {
  FileCrumb,
  FileLocation,
  FileNode,
  FileNodeKind,
  FilePlaceKind,
  FolderListing,
} from '../source/types';

export type PickerMode = 'folder' | 'file' | 'files';

export interface PickerRules {
  readonly mode: PickerMode;
  readonly writableOnly: boolean;
  readonly showHidden: boolean;
}

export interface PickerRow<O = unknown> {
  readonly node: FileNode<O>;
  readonly icon: IconName;
  readonly caption: string | null;
  readonly enabled: boolean;
  readonly opens: boolean;
  readonly picked: boolean;
}

export type PickerChoice<O = unknown> =
  | {
      readonly kind: 'folder';
      readonly location: FileLocation;
      readonly folder: FileNode<O> | null;
      readonly label: string;
    }
  | { readonly kind: 'files'; readonly nodes: readonly FileNode<O>[] };

export interface PickerHere<O = unknown> {
  readonly location: FileLocation;
  readonly listing: FolderListing<O>;
  readonly abilities: FileAbilities;
  readonly writable: boolean;
}

export interface ChoiceView<O = unknown> {
  readonly choice: PickerChoice<O> | null;
  readonly label: string;
  readonly summary: string;
  readonly reason: string | null;
}

const NODE_ICON: Readonly<Record<FileNodeKind, IconName>> = {
  folder: 'folder',
  image: 'image',
  video: 'film',
  audio: 'music',
  document: 'fileText',
  archive: 'archive',
  link: 'link',
  special: 'cpu',
  other: 'fileText',
};

const PLACE_ICON: Readonly<Record<FilePlaceKind, IconName>> = {
  my_drive: 'cloud',
  shared_drive: 'users',
  shared_with_me: 'users',
  home: 'house',
  root: 'monitor',
  folder: 'folder',
  volume: 'server',
  trash: 'trash',
};

const TITLE: Readonly<Record<PickerMode, string>> = {
  folder: 'Choose folder',
  file: 'Choose file',
  files: 'Choose files',
};

export function nodeIconOf(kind: FileNodeKind): IconName {
  return NODE_ICON[kind];
}

export function placeIconOf(kind: FilePlaceKind): IconName {
  return PLACE_ICON[kind];
}

export function pickerTitleOf(mode: PickerMode): string {
  return TITLE[mode];
}

function pickable(node: FileNode, rules: PickerRules): boolean {
  if (node.kind === 'folder' || rules.mode === 'folder') return false;
  return !rules.writableOnly || node.writable;
}

function shown(node: FileNode, rules: PickerRules): boolean {
  if (node.hidden && !rules.showHidden) return false;
  return rules.mode !== 'folder' || node.kind === 'folder';
}

export function pickerRowsOf<O>(
  entries: readonly FileNode<O>[],
  rules: PickerRules,
  picked: readonly string[],
): readonly PickerRow<O>[] {
  const chosen = new Set(picked);
  return entries
    .filter((node) => shown(node, rules))
    .map((node) => {
      const opens = node.kind === 'folder';
      return {
        node,
        icon: nodeIconOf(node.kind),
        caption: captionOf(node),
        enabled: opens || pickable(node, rules),
        opens,
        picked: chosen.has(node.key),
      };
    });
}

export function togglePick(
  picked: readonly string[],
  node: FileNode,
  rules: PickerRules,
): readonly string[] {
  if (!pickable(node, rules)) return picked;
  if (rules.mode === 'file') return picked.includes(node.key) ? [] : [node.key];
  return picked.includes(node.key)
    ? picked.filter((key) => key !== node.key)
    : [...picked, node.key];
}

export function folderLabelOf(crumbs: readonly FileCrumb[], fallback: string): string {
  return crumbs.at(-1)?.label ?? fallback;
}

function folderChoice<O>(
  here: PickerHere<O>,
  rules: PickerRules,
  refusal: string | null,
  fallback: string,
): ChoiceView<O> {
  const label = folderLabelOf(here.listing.crumbs, fallback);
  const loaded = !here.listing.loading && here.listing.error === null;
  const reason =
    refusal ??
    (rules.writableOnly && !here.writable
      ? 'You can only view this folder, so it can’t be chosen.'
      : null);
  const ready = loaded && reason === null;
  return {
    choice: ready
      ? { kind: 'folder', location: here.location, folder: here.listing.folder, label }
      : null,
    label: 'Choose this folder',
    summary: loaded ? `Choosing ${label}` : 'Reading the folder…',
    reason: loaded ? reason : null,
  };
}

function filesChoice<O>(
  here: PickerHere<O>,
  rules: PickerRules,
  picked: readonly string[],
): ChoiceView<O> {
  const chosen = new Set(picked);
  const nodes = here.listing.entries.filter((node) => chosen.has(node.key));
  const many = rules.mode === 'files';
  const [only] = nodes;
  const summary =
    only === undefined
      ? many
        ? 'Select files'
        : 'Select a file'
      : nodes.length === 1
        ? `Choosing ${only.name}`
        : `Choosing ${plural(nodes.length, 'file')}`;
  return {
    choice: nodes.length === 0 ? null : { kind: 'files', nodes },
    label: many && nodes.length > 1 ? `Choose ${plural(nodes.length, 'file')}` : 'Choose file',
    summary,
    reason: null,
  };
}

export interface ChoiceInput<O> {
  readonly here: PickerHere<O>;
  readonly rules: PickerRules;
  readonly picked: readonly string[];
  readonly refusal: string | null;
  readonly fallback: string;
}

export function choiceViewOf<O>(input: ChoiceInput<O>): ChoiceView<O> {
  const { here, rules } = input;
  return rules.mode === 'folder'
    ? folderChoice(here, rules, input.refusal, input.fallback)
    : filesChoice(here, rules, input.picked);
}

export function writableHereOf(listing: FolderListing, canWrite: boolean): boolean {
  return listing.folder === null ? canWrite : listing.folder.writable && canWrite;
}

export function createdLocationOf(location: FileLocation, result: OpResult): FileLocation | null {
  const [key] = result.done;
  return key === undefined ? null : { place: location.place, folder: key };
}

export function emptyTextOf(mode: PickerMode, canCreate: boolean): string {
  if (mode !== 'folder') return 'There are no files here.';
  return canCreate ? 'Choose it anyway or create a folder inside it.' : 'Choose it anyway.';
}

export function emptyTitleOf(mode: PickerMode): string {
  return mode === 'folder' ? 'No folders in here' : 'This folder is empty';
}
