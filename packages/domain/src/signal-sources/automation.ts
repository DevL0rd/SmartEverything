import type { SignalSourceSpec } from './spec';

const AUTOMATION_VALUE_SIGNALS: SignalSourceSpec = {
  source: 'automation_value',
  label: 'Automation Values',
  kinds: [
    {
      kind: 'changed',
      label: 'A Value changes',
      subject: 'automation_value',
      fields: [{ field: 'value', label: 'Current value', unit: null }],
      match: [
        { key: 'kind', label: 'Value type', values: ['boolean', 'number', 'duration', 'choice'] },
      ],
      pulse: false,
    },
  ],
};
const AUTOMATION_RUN_SIGNALS: SignalSourceSpec = {
  source: 'automation_run',
  label: 'Automation runs',
  kinds: [
    {
      kind: 'status',
      label: 'A run changes status',
      subject: 'automation',
      fields: [],
      match: [
        {
          key: 'status',
          label: 'Run status',
          values: [
            'queued',
            'running',
            'cancelling',
            'cancelled',
            'succeeded',
            'failed',
            'interrupted',
            'ignored',
          ],
        },
      ],
      pulse: true,
    },
  ],
};

const AUTOMATION_EVENT_SIGNALS: SignalSourceSpec = {
  source: 'automation_event',
  label: 'Automation events',
  kinds: [
    {
      kind: 'sent',
      label: 'An automation sends an event',
      subject: 'none',
      fields: 'free',
      match: [],
      pulse: true,
    },
  ],
};

const AUTOMATION_TIMER_SIGNALS: SignalSourceSpec = {
  source: 'automation_timer',
  label: 'Automation timers',
  kinds: [
    {
      kind: 'finished',
      label: 'A timer finishes',
      subject: 'none',
      fields: 'free',
      match: [],
      pulse: true,
    },
  ],
};

const WEBHOOK_SIGNALS: SignalSourceSpec = {
  source: 'webhook',
  label: 'Webhooks',
  kinds: [
    {
      kind: 'received',
      label: 'A webhook is called',
      subject: 'none',
      fields: 'free',
      match: [{ key: 'method', label: 'Method', values: ['GET', 'POST', 'PUT', 'DELETE'] }],
      pulse: true,
      ownerOnly: true,
      transient: true,
    },
  ],
};

export const AUTOMATION_EVENT_SOURCE = AUTOMATION_EVENT_SIGNALS.source;
export const AUTOMATION_TIMER_SOURCE = AUTOMATION_TIMER_SIGNALS.source;
export const WEBHOOK_SOURCE = WEBHOOK_SIGNALS.source;

export const AUTOMATION_RUNTIME_SIGNAL_SOURCES: readonly SignalSourceSpec[] = [
  AUTOMATION_VALUE_SIGNALS,
  AUTOMATION_RUN_SIGNALS,
  AUTOMATION_EVENT_SIGNALS,
  AUTOMATION_TIMER_SIGNALS,
  WEBHOOK_SIGNALS,
];
