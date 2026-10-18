import type { IconName } from '../../../components/icon';
import {
  ACCESS_LEVELS,
  accessFootnote,
  type AccessEngine,
  type AccessOption,
  type AccessPill,
  type AccessSection,
} from './ai-access';

const HUB_MEMBER_NOTE = 'Only the owner can use system files and commands on Home Hub.';

export interface AccessRow {
  readonly key: string;
  readonly option: AccessOption;
  readonly selected: boolean;
  readonly unavailable: string | null;
}

export interface AccessSectionView {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly AccessRow[];
}

export interface AccessBanner {
  readonly icon: IconName;
  readonly text: string;
  readonly action: { readonly label: string; readonly onPress: () => void } | null;
}

export interface ToolsAccess {
  readonly label: string;
  readonly onOpen: () => void;
}

interface CloudAccess {
  readonly intro: string;
  readonly onComputer: () => void;
}

export interface AccessModel {
  readonly title: string;
  readonly pill: AccessPill;
  readonly nextTurn: boolean;
  readonly sections: readonly AccessSectionView[];
  readonly applying: string | null;
  readonly blocked: boolean;
  readonly banner: AccessBanner | null;
  readonly footnote: string;
  readonly tools: ToolsAccess | null;
  readonly cloud: CloudAccess | null;
  readonly select: (sectionId: string, value: string) => void;
}

export function rowKey(sectionId: string, value: string): string {
  return `${sectionId}:${value}`;
}

export function sectionView(
  section: AccessSection,
  selected: string | null,
  unavailable: (option: AccessOption) => string | null,
): AccessSectionView {
  return {
    id: section.id,
    title: section.title,
    rows: section.options.map((option): AccessRow => ({
      key: rowKey(section.id, option.value),
      option,
      selected: option.value === selected,
      unavailable: unavailable(option),
    })),
  };
}

export function sectionById(sections: readonly AccessSection[], id: string): AccessSection {
  const found = sections.find((section) => section.id === id);
  if (found === undefined)
    throw new Error(`Access section "${id}" does not exist; expected one of ${listIds(sections)}.`);
  return found;
}

function listIds(sections: readonly AccessSection[]): string {
  return sections.map((section) => section.id).join(', ');
}

export function accessFootnoteText(
  engine: AccessEngine,
  restart: boolean,
  hubNote: boolean,
): string {
  const base = accessFootnote(engine, restart);
  return hubNote ? `${base} · ${HUB_MEMBER_NOTE}` : base;
}

export function cautionIcon(row: AccessRow): IconName | null {
  if (row.option.level === null) return null;
  const look = ACCESS_LEVELS[row.option.level];
  return look.tone === 'caution' ? look.icon : null;
}
