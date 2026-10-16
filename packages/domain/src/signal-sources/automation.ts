import type { SignalSourceSpec } from './spec';

export const AUTOMATION_VALUE_SIGNALS: SignalSourceSpec = {
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
export const AUTOMATION_RUN_SIGNALS: SignalSourceSpec = {
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

export const AUTOMATION_RUNTIME_SIGNAL_SOURCES: readonly SignalSourceSpec[] = [
  AUTOMATION_VALUE_SIGNALS,
  AUTOMATION_RUN_SIGNALS,
];
