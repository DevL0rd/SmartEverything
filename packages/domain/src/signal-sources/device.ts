import type { SignalSourceSpec } from './spec';

export const DEVICE_SIGNALS: SignalSourceSpec = {
  source: 'device',
  label: 'Devices',
  kinds: [
    {
      kind: 'state',
      label: 'A device value changes',
      subject: 'device',
      fields: 'capabilities',
      match: [],
      pulse: false,
    },
  ],
};
