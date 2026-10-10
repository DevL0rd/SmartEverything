import type { SignalSourceSpec } from './spec';

export const WEATHER_SIGNALS: SignalSourceSpec = {
  source: 'weather',
  label: 'Weather',
  kinds: [
    {
      kind: 'forecast',
      label: 'The forecast updates',
      subject: 'none',
      fields: [],
      match: [],
      pulse: true,
    },
  ],
};
