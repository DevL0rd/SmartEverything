import {
  EVENT_KIND_LABELS,
  EVENT_KINDS,
  SIGNAL_SOURCES,
  eventKeywords,
  eventLabel,
  kindSpecOf,
  type SignalTriggerV2,
  type TriggerV2,
} from '@smarteverything/domain';

function signalKeywords(trigger: SignalTriggerV2): readonly string[] {
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

export function triggerKeywordsOf(triggers: readonly TriggerV2[]): readonly string[] {
  return [
    ...new Set(
      triggers.flatMap((trigger) => (trigger.on === 'signal' ? signalKeywords(trigger) : [])),
    ),
  ];
}
