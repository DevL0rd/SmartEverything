import type { SMART_RULE_ITEM_KINDS } from '@smarteverything/domain';
import {
  SMART_RULE,
  type DriveAlbum,
  type DriveAlbumChange,
  type DriveAlbumCreate,
  type SmartRule,
  type SmartRuleLeaf,
} from '@smarteverything/domain';
import { DAY_KEY } from '../../../format/time';

export type RuleKind = (typeof SMART_RULE_ITEM_KINDS)[number];

export interface RuleChip {
  readonly key: number;
  readonly leaf: SmartRuleLeaf;
}

export type AddField = 'kind' | 'name' | 'path' | 'added' | 'changed' | 'starred';

export type AddingRow =
  | { readonly field: 'kind'; readonly kind: RuleKind }
  | { readonly field: 'name' | 'path'; readonly contains: string }
  | { readonly field: 'added' | 'changed'; readonly since: string }
  | { readonly field: 'starred' };

export interface SmartDraft {
  readonly title: string;
  readonly scope: DriveAlbum['scope'];
  readonly match: SmartRule['match'];
  readonly chips: readonly RuleChip[];
  readonly adding: AddingRow | null;
  readonly next: number;
}

export const ADD_FIELDS: readonly { readonly value: AddField; readonly label: string }[] = [
  { value: 'kind', label: 'Kind' },
  { value: 'name', label: 'Name has' },
  { value: 'path', label: 'Path has' },
  { value: 'added', label: 'Added since' },
  { value: 'changed', label: 'Changed since' },
  { value: 'starred', label: 'Starred' },
];

export function blankAdding(field: AddField): AddingRow {
  switch (field) {
    case 'kind':
      return { field, kind: 'document' };
    case 'name':
    case 'path':
      return { field, contains: '' };
    case 'added':
    case 'changed':
      return { field, since: '' };
    case 'starred':
      return { field };
  }
}

function sinceLeaf(field: 'addedAt' | 'modifiedAt', since: string): SmartRuleLeaf | null {
  const day = since.trim();
  if (!DAY_KEY.safeParse(day).success) return null;
  return { kind: 'date_range', field, from: day, to: null };
}

function textLeaf(field: 'name' | 'path', contains: string): SmartRuleLeaf | null {
  const text = contains.trim();
  return text === '' ? null : { kind: 'text', field, contains: text };
}

export function leafOfAdding(row: AddingRow): SmartRuleLeaf | null {
  switch (row.field) {
    case 'kind':
      return { kind: 'item_kind', itemKinds: [row.kind] };
    case 'name':
    case 'path':
      return textLeaf(row.field, row.contains);
    case 'added':
      return sinceLeaf('addedAt', row.since);
    case 'changed':
      return sinceLeaf('modifiedAt', row.since);
    case 'starred':
      return { kind: 'starred', starred: true };
  }
}

export function newDraft(title: string, scope: DriveAlbum['scope']): SmartDraft {
  return { title, scope, match: 'all', chips: [], adding: blankAdding('kind'), next: 0 };
}

export function draftOfRule(
  title: string,
  rule: SmartRule | null,
  scope: DriveAlbum['scope'],
): SmartDraft {
  if (rule === null) return newDraft(title, scope);
  return {
    title,
    scope,
    match: rule.match,
    chips: rule.rules.map((leaf, key) => ({ key, leaf })),
    adding: null,
    next: rule.rules.length,
  };
}

export function ruleOfDraft(draft: SmartDraft): SmartRule | null {
  const parsed = SMART_RULE.safeParse({
    match: draft.match,
    rules: draft.chips.map((chip) => chip.leaf),
  });
  return parsed.success ? parsed.data : null;
}

export function startAdding(draft: SmartDraft, field: AddField): SmartDraft {
  return { ...draft, adding: blankAdding(field) };
}

export function editAdding(draft: SmartDraft, adding: AddingRow): SmartDraft {
  return { ...draft, adding };
}

export function cancelAdding(draft: SmartDraft): SmartDraft {
  return { ...draft, adding: null };
}

export function commitAdding(draft: SmartDraft): SmartDraft {
  const leaf = draft.adding === null ? null : leafOfAdding(draft.adding);
  if (leaf === null) return draft;
  return {
    ...draft,
    chips: [...draft.chips, { key: draft.next, leaf }],
    adding: null,
    next: draft.next + 1,
  };
}

export function removeChip(draft: SmartDraft, key: number): SmartDraft {
  return { ...draft, chips: draft.chips.filter((chip) => chip.key !== key) };
}

export type SaveMode = 'create' | 'rename';

export function draftReady(draft: SmartDraft, mode: SaveMode): boolean {
  if (draft.title.trim() === '') return false;
  return mode === 'rename' || ruleOfDraft(draft) !== null;
}

export function createBody(draft: SmartDraft): DriveAlbumCreate | null {
  const title = draft.title.trim();
  const rule = ruleOfDraft(draft);
  if (title === '' || rule === null) return null;
  return { kind: 'smart', title, surface: 'drive', scope: draft.scope, rule };
}

export function renameBody(draft: SmartDraft): DriveAlbumChange | null {
  const title = draft.title.trim();
  return title === '' ? null : { title };
}
