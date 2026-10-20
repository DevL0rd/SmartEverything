import { WEATHER_KINDS, WEATHER_KIND_LABELS, WET_KINDS } from '../weather/conditions';
import {
  RAIN_HORIZONS,
  WEATHER_BAND_METRICS,
  WEATHER_SIGNAL_METRICS,
  WEATHER_SIGNAL_METRIC_INFO,
  type WeatherSignalMetric,
} from '../weather/signal-metrics';
import type { SignalFieldSpec, SignalSourceSpec } from './spec';

function fieldOf(metric: WeatherSignalMetric): SignalFieldSpec {
  const info = WEATHER_SIGNAL_METRIC_INFO[metric];
  return { field: metric, label: info.label, unit: info.unit };
}

const KIND_LABELS: Readonly<Record<string, string>> = WEATHER_KIND_LABELS;

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
    {
      kind: 'changed',
      label: 'A weather value changes',
      subject: 'none',
      fields: WEATHER_SIGNAL_METRICS.map(fieldOf),
      match: [],
      pulse: false,
    },
    {
      kind: 'band',
      label: 'A weather value moves into another band',
      subject: 'none',
      fields: WEATHER_BAND_METRICS.map(fieldOf),
      match: [
        { key: 'to', label: 'The new band', values: null },
        { key: 'from', label: 'The band before', values: null },
      ],
      pulse: false,
    },
    {
      kind: 'condition',
      label: 'The weather condition changes',
      subject: 'none',
      fields: [],
      match: [
        { key: 'to', label: 'The new condition', values: WEATHER_KINDS, valueLabels: KIND_LABELS },
        {
          key: 'from',
          label: 'The condition before',
          values: WEATHER_KINDS,
          valueLabels: KIND_LABELS,
        },
      ],
      pulse: false,
    },
    {
      kind: 'rain_started',
      label: 'Rain, drizzle, snow or a storm starts',
      subject: 'none',
      fields: [],
      match: [
        { key: 'kind', label: 'What falls', values: [...WET_KINDS], valueLabels: KIND_LABELS },
      ],
      pulse: true,
    },
    {
      kind: 'rain_stopped',
      label: 'Rain, drizzle, snow or a storm stops',
      subject: 'none',
      fields: [],
      match: [],
      pulse: true,
    },
    {
      kind: 'rain_expected',
      label: 'Rain is expected soon',
      subject: 'none',
      fields: [],
      match: [{ key: 'within', label: 'How soon', values: RAIN_HORIZONS }],
      pulse: true,
    },
  ],
};
