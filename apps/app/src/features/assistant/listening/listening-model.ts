import {
  LISTENING_SOURCE_KINDS,
  LISTENING_STATE_LABELS,
  SILENCE_DBFS,
  type ListeningSource,
  type ListeningSourceKind,
  type ListeningState,
  type ListeningView,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type RowState = ListeningState | 'blocked';

export type Category = 'listening' | 'busy' | 'rest' | 'need' | 'gone';

export type Mark = 'positive' | 'info' | 'warning' | 'faint' | 'hollow';

export interface StateLook {
  readonly label: string;
  readonly mark: Mark;
  readonly category: Category;
  readonly icon?: IconName;
}

const LOOK: Readonly<Record<ListeningState, Omit<StateLook, 'label'>>> = {
  listening: { mark: 'positive', category: 'listening' },
  in_conversation: { mark: 'info', category: 'busy' },
  off: { mark: 'faint', category: 'rest' },
  privacy: { mark: 'info', category: 'rest' },
  discord_call: { mark: 'info', category: 'rest' },
  needs_permission: { mark: 'warning', category: 'need' },
  no_host: { mark: 'warning', category: 'need' },
  offline: { mark: 'hollow', category: 'gone' },
};

const BLOCKED: StateLook = {
  label: 'Blocked by setting',
  mark: 'hollow',
  category: 'gone',
  icon: 'lock',
};

export function lookOf(state: RowState, lastKnown = false): StateLook {
  if (state === 'blocked') return BLOCKED;
  const label = LISTENING_STATE_LABELS[state];
  if (!lastKnown) return { label, ...LOOK[state] };
  return { ...LOOK[state], label: `Last known \u00b7 ${label}`, mark: 'hollow' };
}

export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  listening: 'Listening',
  busy: 'In a conversation',
  rest: 'Resting',
  need: 'Needs you',
  gone: 'Offline or blocked',
};

export const CATEGORY_ORDER: readonly Category[] = ['listening', 'busy', 'rest', 'need', 'gone'];

export const KIND_ICONS: Readonly<Record<ListeningSourceKind, IconName>> = {
  camera: 'camera',
  phone: 'smartphone',
  computer: 'monitor',
  discord: 'users',
  walkie: 'radio',
};

export const KIND_NOUNS: Readonly<Record<ListeningSourceKind, string>> = {
  camera: 'camera',
  phone: 'phone',
  computer: 'computer',
  discord: 'Discord server',
  walkie: 'channel',
};

export interface ListeningRow {
  readonly source: ListeningSource;
  readonly state: RowState;
}

export interface ListeningGroup {
  readonly kind: ListeningSourceKind;
  readonly rows: readonly ListeningRow[];
}

function blockedCamera(
  source: ListeningSource,
  allowed: ReadonlySet<string> | null,
): boolean {
  return source.kind === 'camera' && allowed !== null && !allowed.has(source.key);
}

export function rowsOf(
  view: ListeningView,
  allowedCameras: ReadonlySet<string> | null,
): readonly ListeningRow[] {
  return view.sources.map((source) => ({
    source,
    state: blockedCamera(source, allowedCameras) ? 'blocked' : source.state,
  }));
}

export function groupsOf(rows: readonly ListeningRow[]): readonly ListeningGroup[] {
  return LISTENING_SOURCE_KINDS.map((kind) => ({
    kind,
    rows: rows.filter((row) => row.source.kind === kind),
  })).filter((group) => group.rows.length > 0);
}

export function switchable(row: ListeningRow): boolean {
  return row.state !== 'blocked' && row.source.changeable;
}

export function isListening(row: ListeningRow): boolean {
  return lookOf(row.state).category === 'listening';
}

export type Counts = Readonly<Record<Category, number>>;

export function countsOf(rows: readonly ListeningRow[], offline: boolean): Counts {
  const counts: Record<Category, number> = { listening: 0, busy: 0, rest: 0, need: 0, gone: 0 };
  for (const row of rows) {
    counts[offline ? 'gone' : lookOf(row.state).category] += 1;
  }
  return counts;
}

export interface MasterState {
  readonly value: boolean;
  readonly mixed: boolean;
}

export function masterOf(rows: readonly ListeningRow[], key: 'wake' | 'transcribe'): MasterState {
  const targets = rows.filter(switchable);
  const on = targets.filter((row) => row.source[key]).length;
  return {
    value: targets.length > 0 && on === targets.length,
    mixed: on > 0 && on < targets.length,
  };
}

const METER_FLOOR = -60;

export function levelShare(dbfs: number): number {
  return Math.max(0, Math.min(1, (Math.max(dbfs, SILENCE_DBFS) - METER_FLOOR) / -METER_FLOOR));
}

export function dbLabel(dbfs: number): string {
  return `−${String(Math.abs(Math.round(dbfs)))} dB`;
}

export function claimBarHeight(dbfs: number): number {
  const MIN = 4;
  const SPAN = 20;
  return MIN + levelShare(dbfs) * SPAN;
}
