import { EVENT_KIND_LABELS } from '../event-labels';
import { EVENT_KINDS, isUrgent } from '../events';
import { EVENT_MATCH } from './event-match';
import type { SignalSourceSpec } from './spec';

export const EVENT_SIGNALS: SignalSourceSpec = {
  source: 'event',
  label: 'Events',
  kinds: EVENT_KINDS.filter((kind) => kind !== 'signal').map((kind) => ({
    kind,
    label: EVENT_KIND_LABELS[kind],
    subject: 'device',
    fields: [],
    match: EVENT_MATCH[kind],
    pulse: true,
    urgent: isUrgent(kind),
  })),
};
