import {
  CAMERA_DETECTION_PRESENTATIONS,
  EVENT_KIND_LABELS,
  eventKeywords,
  eventLabel,
} from './event-labels';
import { EVENT_KINDS } from './events';
import { SIGNAL_SOURCES, kindSpecOf } from './signal-sources/index';
import type { TriggerCatalogue, TriggerRow } from './trigger-catalogue';
import type { TriggerGroup } from './trigger-groups';
import type { JsonValue } from './values';

export const CAMERA_EVENT_SEARCH_WORDS: readonly string[] = [
  'sound',
  'noise',
  ...Object.values(CAMERA_DETECTION_PRESENTATIONS).flatMap((entry) => [
    entry.label,
    ...entry.keywords,
  ]),
];

export interface SignalKeywordTrigger {
  readonly source: string;
  readonly kind: string;
  readonly match?: Readonly<Record<string, JsonValue>> | undefined;
}

export function signalTriggerKeywords(trigger: SignalKeywordTrigger): readonly string[] {
  const spec = kindSpecOf(SIGNAL_SOURCES, trigger);
  const match = trigger.match ?? {};
  const eventKind = EVENT_KINDS.find((kind) => kind === trigger.kind);
  const eventWords =
    trigger.source === 'event' && eventKind !== undefined
      ? [
          EVENT_KIND_LABELS[eventKind],
          eventKind,
          ...(eventKind === 'sound' ? ['noise'] : []),
          eventLabel(eventKind, match),
          ...eventKeywords(eventKind, match),
        ]
      : [];
  const matchWords =
    spec?.match.flatMap((entry) => {
      const value = match[entry.key];
      return entry.values !== null && typeof value === 'string' && entry.values.includes(value)
        ? [entry.label, entry.valueLabels?.[value] ?? value]
        : [];
    }) ?? [];
  return [trigger.source, spec?.label ?? trigger.kind, ...eventWords, ...matchWords];
}

export interface TriggerCatalogueSearch {
  readonly query?: string | undefined;
  readonly group?: TriggerGroup | undefined;
}

const HAYSTACKS = new WeakMap<TriggerRow, string>();

function haystackOf(row: TriggerRow): string {
  const known = HAYSTACKS.get(row);
  if (known !== undefined) {
    return known;
  }
  const text = [row.label, row.sourceLabel, ...row.keywords].join(' ').toLowerCase();
  HAYSTACKS.set(row, text);
  return text;
}

export function searchTriggerCatalogue(
  catalogue: TriggerCatalogue,
  search: TriggerCatalogueSearch,
): readonly TriggerRow[] {
  const words = (search.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  return catalogue.rows.filter(
    (row) =>
      (search.group === undefined || row.group === search.group) &&
      words.every((word) => haystackOf(row).includes(word)),
  );
}
