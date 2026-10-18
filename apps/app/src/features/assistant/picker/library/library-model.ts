import { AI_MODEL_SEARCH_SORT, type AiModelSearchSort } from '@smarteverything/domain';
import { activeModelFilters, type ModelSearchFilters } from '../model-search-filters';

export type LibraryMode = 'pick' | 'default' | 'browse';

interface ModeFacts {
  readonly title: string;
  readonly subtitle: string | null;
  readonly action: string | null;
}

const MODES: Readonly<Record<LibraryMode, ModeFacts>> = {
  pick: { title: 'Model library', subtitle: null, action: 'Use in this chat' },
  default: {
    title: 'Default for new chats',
    subtitle: 'Used when you start a chat',
    action: 'Set as default',
  },
  browse: { title: 'Model library', subtitle: null, action: null },
};

export function libraryTitle(mode: LibraryMode): string {
  return MODES[mode].title;
}

export function librarySubtitle(mode: LibraryMode): string | null {
  return MODES[mode].subtitle;
}

export interface PrimaryAction {
  readonly label: string;
  readonly run: (() => void) | null;
}

export function primaryAction(
  mode: LibraryMode,
  selected: { readonly pick: (() => void) | null } | null,
): PrimaryAction | null {
  const label = MODES[mode].action;
  return label === null ? null : { label, run: selected?.pick ?? null };
}

export interface RowMarks {
  readonly badge: boolean;
  readonly check: boolean;
  readonly latestCaption: boolean;
}

export function marksOf(mode: LibraryMode, selected: boolean, latest: boolean): RowMarks {
  if (mode === 'default') return { badge: selected, check: false, latestCaption: false };
  return { badge: false, check: selected, latestCaption: latest };
}

export type LibraryLayout = 'three' | 'two' | 'one';

const DIALOG_MAX_WIDTH = 960;
const DIALOG_MARGIN = 48;
const THREE_COLUMNS_AT = 900;
const TWO_COLUMNS_AT = 760;

export const ROW_HEIGHT = { pointer: 72, touch: 88 } as const;

export function dialogWidth(windowWidth: number): number {
  return Math.min(DIALOG_MAX_WIDTH, windowWidth - DIALOG_MARGIN);
}

export function libraryLayout(width: number, touch: boolean): LibraryLayout {
  if (touch || width < TWO_COLUMNS_AT) return 'one';
  return width >= THREE_COLUMNS_AT ? 'three' : 'two';
}

const SORT_LABELS: Readonly<Record<AiModelSearchSort, string>> = {
  newest: 'Newest',
  name: 'Name A–Z',
  intelligence: 'Intelligence',
  latency: 'Lowest latency',
  'input-price': 'Lowest input cost',
  'output-price': 'Lowest output cost',
  context: 'Largest context',
};

export const SORT_OPTIONS = AI_MODEL_SEARCH_SORT.options.map((value) => ({
  value,
  label: SORT_LABELS[value],
}));

export const MODALITY_OPTIONS = ['text', 'image', 'audio', 'video', 'file'] as const;

export const CONTEXT_OPTIONS = [
  { value: '32000', label: '32K' },
  { value: '128000', label: '128K' },
  { value: '200000', label: '200K' },
  { value: '1000000', label: '1M' },
] as const;

export function modalityLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function activeCount(filters: ModelSearchFilters, sources: ReadonlySet<string>): number {
  return activeModelFilters(filters) + sources.size;
}

export function scrollTarget(
  index: number,
  rowHeight: number,
  offset: number,
  viewport: number,
): number | null {
  const top = index * rowHeight;
  if (top < offset) return top;
  const bottom = top + rowHeight;
  return bottom > offset + viewport ? bottom - viewport : null;
}
