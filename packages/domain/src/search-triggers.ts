import type { Trigger } from './automations';
import {
  CAMERA_DETECTION_PRESENTATIONS,
  EVENT_KIND_LABELS,
  eventKeywords,
  eventLabel,
} from './event-labels';
import { EVENT_KINDS } from './events';
import { SIGNAL_SOURCES, kindSpecOf } from './signal-sources/index';
import type { SignalTrigger } from './signals';

export const CAMERA_EVENT_SEARCH_WORDS: readonly string[] = [
  'sound',
  'noise',
  ...Object.values(CAMERA_DETECTION_PRESENTATIONS).flatMap((entry) => [
    entry.label,
    ...entry.keywords,
  ]),
];

function signalKeywords(trigger: SignalTrigger): readonly string[] {
  const spec = kindSpecOf(SIGNAL_SOURCES, trigger);
  const eventKind = EVENT_KINDS.find((kind) => kind === trigger.kind);
  const eventWords =
    trigger.source === 'event' && eventKind !== undefined
      ? [
          EVENT_KIND_LABELS[eventKind],
          ...(eventKind === 'sound' ? ['noise'] : []),
          eventLabel(eventKind, trigger.match),
          ...eventKeywords(eventKind, trigger.match),
        ]
      : [];
  const matchWords =
    spec?.match.flatMap((entry) => {
      const value = trigger.match[entry.key];
      return entry.values !== null && typeof value === 'string' && entry.values.includes(value)
        ? [entry.label, entry.valueLabels?.[value] ?? value]
        : [];
    }) ?? [];
  return [trigger.source, spec?.label ?? trigger.kind, ...eventWords, ...matchWords];
}

export function triggerSearchKeywords(triggers: readonly Trigger[]): readonly string[] {
  return [
    ...new Set(
      triggers.flatMap((trigger) => {
        if (trigger.type === 'signal') {
          return signalKeywords(trigger);
        }
        return trigger.type === 'event'
          ? [
              EVENT_KIND_LABELS[trigger.kind],
              trigger.kind,
              ...(trigger.kind === 'sound' ? ['noise'] : []),
            ]
          : [];
      }),
    ),
  ];
}
