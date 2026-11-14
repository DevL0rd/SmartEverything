import type { SmartRule, SmartRuleLeaf } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { bytes } from '../../../format/number';
import { monthShort, playTime, startOfDayKey } from '../../../format/time';
import type { RuleKind } from './rule-chips';

export type PlaceOf = (id: string) => string | null;

export const KIND_WORD: Readonly<Record<RuleKind, string>> = {
  image: 'Photos',
  video: 'Videos',
  audio: 'Audio',
  document: 'Documents',
  other: 'Other files',
};

const KIND_ICON: Readonly<Record<RuleKind, IconName>> = {
  image: 'image',
  video: 'film',
  audio: 'music',
  document: 'fileText',
  other: 'fileText',
};

const DATE_WORD: Readonly<Record<'takenAt' | 'addedAt' | 'modifiedAt', string>> = {
  takenAt: 'Taken',
  addedAt: 'Added',
  modifiedAt: 'Changed',
};

const TEXT_WORD: Readonly<Record<'name' | 'path' | 'camera' | 'lens', string>> = {
  name: 'Name has',
  path: 'Path has',
  camera: 'Camera',
  lens: 'Lens',
};

export function dayText(day: string): string {
  return `${String(Number(day.slice(8, 10)))} ${monthShort(startOfDayKey(day))} ${day.slice(0, 4)}`;
}

function dateText(word: string, from: string | null, to: string | null): string {
  if (from !== null && to !== null) return `${word} ${dayText(from)} to ${dayText(to)}`;
  if (from !== null) return `${word} since ${dayText(from)}`;
  return to === null ? `${word} any time` : `${word} until ${dayText(to)}`;
}

function between(
  word: string,
  min: number | null,
  max: number | null,
  format: (value: number) => string,
): string {
  if (min !== null && max !== null) return `${word} ${format(min)} to ${format(max)}`;
  if (min !== null) return `${word} over ${format(min)}`;
  return max === null ? `${word} any` : `${word} under ${format(max)}`;
}

function placeText(id: string, placeOf: PlaceOf, unknown: string): string {
  const name = placeOf(id);
  return name === null ? unknown : `In ${name}`;
}

export function leafLabel(leaf: SmartRuleLeaf, placeOf: PlaceOf): string {
  switch (leaf.kind) {
    case 'item_kind':
      return leaf.itemKinds.map((kind) => KIND_WORD[kind]).join(' or ');
    case 'text':
      return `${TEXT_WORD[leaf.field]} ${leaf.contains}`;
    case 'date_range':
      return dateText(DATE_WORD[leaf.field], leaf.from, leaf.to);
    case 'in_root':
      return placeText(leaf.rootId, placeOf, 'In one drive');
    case 'in_folder':
      return placeText(leaf.folderId, placeOf, 'In one folder');
    case 'starred':
      return leaf.starred ? 'Starred' : 'Not starred';
    case 'size_range':
      return between('Size', leaf.minBytes, leaf.maxBytes, bytes);
    case 'duration_range':
      return between('Length', leaf.minMs, leaf.maxMs, (ms) => playTime(ms / 1000));
  }
}

const LEAF_ICON: Readonly<Record<Exclude<SmartRuleLeaf['kind'], 'item_kind' | 'text'>, IconName>> =
  {
    date_range: 'calendar',
    in_root: 'hardDrive',
    in_folder: 'folder',
    starred: 'star',
    size_range: 'box',
    duration_range: 'timer',
  };

function kindsIcon(kinds: readonly RuleKind[]): IconName {
  const [only, ...rest] = kinds;
  return only !== undefined && rest.length === 0 ? KIND_ICON[only] : 'fileText';
}

export function leafIcon(leaf: SmartRuleLeaf): IconName {
  if (leaf.kind === 'item_kind') return kindsIcon(leaf.itemKinds);
  if (leaf.kind === 'text') return leaf.field === 'path' ? 'folder' : 'fileText';
  return LEAF_ICON[leaf.kind];
}

export function ruleSummary(rule: SmartRule, placeOf: PlaceOf): string {
  const join = rule.match === 'all' ? ' · ' : ' or ';
  return rule.rules.map((leaf) => leafLabel(leaf, placeOf)).join(join);
}
