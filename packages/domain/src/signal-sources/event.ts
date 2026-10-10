import { EVENT_KIND_LABELS } from '../event-labels';
import { EVENT_KINDS } from '../events';
import { EVENT_MATCH } from './event-match';
import type { SignalSourceSpec } from './spec';

export const EVENT_SIGNALS: SignalSourceSpec = {
  source: 'event',
  label: 'Events',
  kinds: EVENT_KINDS.map((kind) => ({
    kind,
    label: EVENT_KIND_LABELS[kind],
    subject: 'device',
    fields: [],
    match: EVENT_MATCH[kind],
    pulse: true,
  })),
};
