import {
  SMART_RULE,
  type DriveAlbum,
  type DriveAlbumChange,
  type DriveAlbumCreate,
  type SmartRule,
  type SmartRuleLeaf,
} from '@smarteverything/domain';
import { DAY_KEY } from '../../../format/time';

export type RuleField = 'kind' | 'taken' | 'camera' | 'lens' | 'name' | 'favourite';

export type MediaChoice = 'photos' | 'videos' | 'both';

export type RuleRow =
  | { readonly key: number; readonly field: 'kind'; readonly media: MediaChoice }
  | { readonly key: number; readonly field: 'taken'; readonly from: string; readonly to: string }
  | {
      readonly key: number;
      readonly field: 'camera' | 'lens' | 'name';
      readonly contains: string;
    }
  | { readonly key: number; readonly field: 'favourite' }
  | { readonly key: number; readonly field: 'kept'; readonly leaf: SmartRuleLeaf };

export interface AlbumDraft {
  readonly title: string;
  readonly kind: DriveAlbum['kind'];
  readonly scope: DriveAlbum['scope'];
  readonly match: SmartRule['match'];
  readonly rows: readonly RuleRow[];
  readonly next: number;
}

export const RULE_FIELDS: readonly { readonly value: RuleField; readonly label: string }[] = [
  { value: 'kind', label: 'Kind' },
  { value: 'taken', label: 'Taken' },
  { value: 'camera', label: 'Camera' },
  { value: 'lens', label: 'Lens' },
  { value: 'name', label: 'Name' },
  { value: 'favourite', label: 'Favourites' },
];

const MEDIA_KINDS: Readonly<Record<MediaChoice, readonly ('image' | 'video')[]>> = {
  photos: ['image'],
  videos: ['video'],
  both: ['image', 'video'],
};

export function blankRow(key: number, field: RuleField): RuleRow {
  switch (field) {
    case 'kind':
      return { key, field, media: 'photos' };
    case 'taken':
      return { key, field, from: '', to: '' };
    case 'favourite':
      return { key, field };
    case 'camera':
    case 'lens':
    case 'name':
      return { key, field, contains: '' };
  }
}

function mediaOf(kinds: readonly string[]): MediaChoice | null {
  const photos = kinds.includes('image');
  const videos = kinds.includes('video');
  if (kinds.length !== Number(photos) + Number(videos)) return null;
  if (photos && videos) return 'both';
  if (photos) return 'photos';
  return videos ? 'videos' : null;
}

function kindRow(key: number, kinds: readonly string[]): RuleRow | null {
  const media = mediaOf(kinds);
  return media === null ? null : { key, field: 'kind', media };
}

type Leaf<K extends SmartRuleLeaf['kind']> = Extract<SmartRuleLeaf, { readonly kind: K }>;

function takenRow(key: number, leaf: Leaf<'date_range'>): RuleRow | null {
  if (leaf.field !== 'takenAt') return null;
  return { key, field: 'taken', from: leaf.from ?? '', to: leaf.to ?? '' };
}

function textRow(key: number, leaf: Leaf<'text'>): RuleRow | null {
  return leaf.field === 'path' ? null : { key, field: leaf.field, contains: leaf.contains };
}

function editable(key: number, leaf: SmartRuleLeaf): RuleRow | null {
  if (leaf.kind === 'item_kind') return kindRow(key, leaf.itemKinds);
  if (leaf.kind === 'date_range') return takenRow(key, leaf);
  if (leaf.kind === 'text') return textRow(key, leaf);
  return leaf.kind === 'starred' && leaf.starred ? { key, field: 'favourite' } : null;
}

export function rowOf(key: number, leaf: SmartRuleLeaf): RuleRow {
  return editable(key, leaf) ?? { key, field: 'kept', leaf };
}

function day(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function takenLeaf(from: string, to: string): SmartRuleLeaf | null {
  const start = day(from);
  const end = day(to);
  if (start === null && end === null) return null;
  for (const value of [start, end]) {
    if (value !== null && !DAY_KEY.safeParse(value).success) return null;
  }
  if (start !== null && end !== null && start > end) return null;
  return { kind: 'date_range', field: 'takenAt', from: start, to: end };
}

export function leafOf(row: RuleRow): SmartRuleLeaf | null {
  switch (row.field) {
    case 'kind':
      return { kind: 'item_kind', itemKinds: MEDIA_KINDS[row.media] };
    case 'taken':
      return takenLeaf(row.from, row.to);
    case 'favourite':
      return { kind: 'starred', starred: true };
    case 'kept':
      return row.leaf;
    case 'camera':
    case 'lens':
    case 'name': {
      const contains = row.contains.trim();
      return contains === '' ? null : { kind: 'text', field: row.field, contains };
    }
  }
}

export function ruleOf(draft: AlbumDraft): SmartRule | null {
  const leaves = draft.rows.map(leafOf);
  if (leaves.some((leaf) => leaf === null)) return null;
  const parsed = SMART_RULE.safeParse({ match: draft.match, rules: leaves });
  return parsed.success ? parsed.data : null;
}

export function draftReady(draft: AlbumDraft): boolean {
  if (draft.title.trim() === '') return false;
  return draft.kind === 'manual' || ruleOf(draft) !== null;
}

export function newDraft(kind: DriveAlbum['kind'], scope: DriveAlbum['scope']): AlbumDraft {
  return {
    title: '',
    kind,
    scope,
    match: 'all',
    rows: kind === 'smart' ? [blankRow(0, 'kind')] : [],
    next: 1,
  };
}

export function draftOfRule(
  title: string,
  rule: SmartRule,
  scope: DriveAlbum['scope'],
): AlbumDraft {
  return {
    title,
    kind: 'smart',
    scope,
    match: rule.match,
    rows: rule.rules.map((leaf, index) => rowOf(index, leaf)),
    next: rule.rules.length,
  };
}

export function draftOfAlbum(album: DriveAlbum): AlbumDraft {
  if (album.kind === 'smart') return draftOfRule(album.title, album.rule, album.scope);
  return { ...newDraft('manual', album.scope), title: album.title };
}

export function withKind(draft: AlbumDraft, kind: DriveAlbum['kind']): AlbumDraft {
  if (kind === draft.kind) return draft;
  const rows =
    kind === 'smart' && draft.rows.length === 0 ? [blankRow(draft.next, 'kind')] : draft.rows;
  return { ...draft, kind, rows, next: draft.next + 1 };
}

export function addRow(draft: AlbumDraft): AlbumDraft {
  return { ...draft, rows: [...draft.rows, blankRow(draft.next, 'name')], next: draft.next + 1 };
}

export function removeRow(draft: AlbumDraft, key: number): AlbumDraft {
  return { ...draft, rows: draft.rows.filter((row) => row.key !== key) };
}

export function replaceRow(draft: AlbumDraft, row: RuleRow): AlbumDraft {
  return { ...draft, rows: draft.rows.map((each) => (each.key === row.key ? row : each)) };
}

export function retypeRow(draft: AlbumDraft, key: number, field: RuleField): AlbumDraft {
  return replaceRow(draft, blankRow(key, field));
}

export function createBody(draft: AlbumDraft): DriveAlbumCreate | null {
  const title = draft.title.trim();
  if (title === '') return null;
  const base = { title, surface: 'photos', scope: draft.scope } as const;
  if (draft.kind === 'manual') return { ...base, kind: 'manual', itemIds: [] };
  const rule = ruleOf(draft);
  return rule === null ? null : { ...base, kind: 'smart', rule };
}

export function changeBody(album: DriveAlbum, draft: AlbumDraft): DriveAlbumChange | null {
  const title = draft.title.trim();
  if (title === '') return null;
  if (album.kind === 'manual') return { title };
  const rule = ruleOf(draft);
  return rule === null ? null : { title, rule };
}
