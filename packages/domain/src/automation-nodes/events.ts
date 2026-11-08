import type { FlowType } from '../automation-v3/types';
import { EVENT_KIND_LABELS } from '../event-labels';
import { EVENT_KINDS } from '../events';
import { defineNodeKind, type NodeKind } from './define';
import { DEVICE_REF, TARGET_REF } from './devices';

const TEXT: FlowType = { t: 'text' };

export const EVENT_COUNT_DEFAULT_LAST = 86_400_000;

const EVENT_KIND_CHOICE: FlowType = {
  t: 'choice',
  options: EVENT_KINDS.map((id) => ({ id, label: EVENT_KIND_LABELS[id] })),
};

const EVENT_RECORD: FlowType = {
  t: 'record',
  fields: {
    id: TEXT,
    device: { t: 'optional', of: DEVICE_REF },
    kind: EVENT_KIND_CHOICE,
    at: { t: 'instant' },
    details: { t: 'record', values: { t: 'any' } },
  },
};

const EVENT_COUNT = defineNodeKind({
  id: 'event.count',
  name: 'Count events',
  category: 'state',
  icon: 'list',
  class: 'read',
  description:
    'Counts the events devices reported recently, such as doorbell rings, motion, leaks, finished cycles or faults, and lists them. Leave the devices empty to look at the whole home and the kinds empty to count every kind.',
  inputs: [
    {
      name: 'target',
      type: { t: 'optional', of: TARGET_REF },
      required: false,
      description: 'Which devices, a room or a group; empty means the whole home.',
      summary: true,
    },
    {
      name: 'kinds',
      type: { t: 'list', of: EVENT_KIND_CHOICE },
      required: false,
      default: [],
      static: true,
      description: 'Only these kinds of event; empty means every kind.',
      summary: true,
      ui: { label: 'Kinds of event', optionsFrom: 'event.kinds', multiple: true },
    },
    {
      name: 'last',
      type: { t: 'duration' },
      required: false,
      default: EVENT_COUNT_DEFAULT_LAST,
      static: true,
      description: 'How far back to look.',
      summary: true,
      ui: { label: 'Look back', unit: 'ms', min: 1 },
    },
  ],
  outputs: [
    {
      name: 'count',
      type: { t: 'number', integer: true, min: 0 },
      description: 'How many events.',
    },
    {
      name: 'latest',
      type: { t: 'instant' },
      optional: true,
      description: 'When the newest event happened; empty when there was none.',
    },
    {
      name: 'events',
      type: { t: 'list', of: EVENT_RECORD },
      description: 'The events, newest first.',
    },
  ],
  exits: [],
  summary: 'Events of {target} in the last {last}',
  keywords: ['event', 'events', 'count', 'how many', 'doorbell', 'motion', 'history', 'recent'],
  reads: () => ['events'],
  access: 'member',
  tier: 'v1.1',
});

export const EVENT_NODE_KINDS: readonly NodeKind[] = [EVENT_COUNT];
