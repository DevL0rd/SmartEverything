import type { JsonValue } from '../values';

export interface TriggerPreset {
  readonly id: string;
  readonly name: string;
  readonly meaning: string;
  readonly kindId: string;
  readonly ports: Readonly<Record<string, JsonValue>>;
  readonly keywords: readonly string[];
}

const WEATHER_KIND = 'trigger.weather';

function weather(id: string, preset: Omit<TriggerPreset, 'id' | 'kindId'>): TriggerPreset {
  return { ...preset, id: `weather.${id}`, kindId: WEATHER_KIND };
}

export const TRIGGER_PRESETS: readonly TriggerPreset[] = [
  weather('rain_started', {
    name: 'It starts raining',
    meaning: 'Starts the moment rain, drizzle, snow or a storm begins.',
    ports: { event: 'rain_started' },
    keywords: ['rain', 'raining', 'starts', 'wet', 'snow', 'storm'],
  }),
  weather('rain_stopped', {
    name: 'It stops raining',
    meaning: 'Starts the moment the rain, drizzle, snow or storm ends.',
    ports: { event: 'rain_stopped' },
    keywords: ['rain', 'stops', 'dry', 'over'],
  }),
  weather('rain_expected', {
    name: 'Rain expected soon',
    meaning: 'Starts when rain is expected within the time you choose.',
    ports: { event: 'rain_expected', within: '30m' },
    keywords: ['rain', 'expected', 'soon', 'forecast', 'umbrella'],
  }),
  weather('temperature_above', {
    name: 'Temperature rises above',
    meaning:
      'Starts once when the outdoor temperature crosses above a value, again after it fell a degree below.',
    ports: { event: 'changed', metric: 'temperature', test: { is: 'gt', to: 25 }, rearm: 24 },
    keywords: ['temperature', 'hot', 'warm', 'above', 'crosses'],
  }),
  weather('temperature_below', {
    name: 'Temperature drops below',
    meaning:
      'Starts once when the outdoor temperature crosses below a value, again after it rose a degree above.',
    ports: { event: 'changed', metric: 'temperature', test: { is: 'lt', to: 5 }, rearm: 6 },
    keywords: ['temperature', 'cold', 'freezing', 'below', 'crosses'],
  }),
  weather('condition', {
    name: 'Weather condition changes',
    meaning: 'Starts when the weather turns, for example from cloudy to rain.',
    ports: { event: 'condition' },
    keywords: ['condition', 'clear', 'cloudy', 'fog', 'snow', 'storm'],
  }),
  weather('wind_strong', {
    name: 'It gets windy',
    meaning: 'Starts the moment the wind turns windy or stronger.',
    ports: { event: 'band', metric: 'wind_speed', to: 'windy' },
    keywords: ['wind', 'windy', 'gale', 'storm', 'gusts'],
  }),
  weather('uv_high', {
    name: 'UV index turns high',
    meaning: 'Starts the moment the UV index moves into the high band.',
    ports: { event: 'band', metric: 'uv_index', to: 'high' },
    keywords: ['uv', 'sun', 'sunscreen', 'high'],
  }),
  weather('humid', {
    name: 'It turns humid',
    meaning: 'Starts the moment the outdoor humidity moves into the humid band.',
    ports: { event: 'band', metric: 'humidity', to: 'humid' },
    keywords: ['humidity', 'humid', 'muggy', 'damp'],
  }),
  weather('air_poor', {
    name: 'Outdoor air turns poor',
    meaning: 'Starts the moment the outdoor air quality moves into the poor band.',
    ports: { event: 'band', metric: 'aqi', to: 'poor' },
    keywords: ['air quality', 'aqi', 'smog', 'haze', 'pollution'],
  }),
  weather('band', {
    name: 'Weather moves into a band',
    meaning:
      'Starts when any value moves into another band, for example the temperature turning hot.',
    ports: { event: 'band', metric: 'temperature', to: 'hot' },
    keywords: ['band', 'level', 'hot', 'cold', 'cloud', 'precipitation'],
  }),
];
