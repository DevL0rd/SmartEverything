import { describe, expect, it } from 'vitest';
import { daylightText, weatherKindText, weatherRuleText } from './weather-text';

describe('weatherRuleText', () => {
  it('words a threshold as a change when the rule fires on crossing it', () => {
    const above = { is: 'gt', to: 25 } as const;
    expect(weatherRuleText('temperature', above, true)).toBe(
      'outdoor temperature goes above 25\u00a0°C',
    );
    expect(weatherRuleText('temperature', { is: 'lt', to: 5 }, true)).toBe(
      'outdoor temperature drops below 5\u00a0°C',
    );
    expect(weatherRuleText('wind_speed', { is: 'gte', to: 40 }, true)).toBe(
      'wind speed reaches 40\u00a0km/h',
    );
    expect(weatherRuleText('humidity', { is: 'lte', to: 30 }, true)).toBe(
      'outdoor humidity drops to 30%',
    );
  });

  it('words a threshold as a state when it is a condition', () => {
    expect(weatherRuleText('temperature', { is: 'gt', to: 25 }, false)).toBe(
      'outdoor temperature is above 25\u00a0°C',
    );
    expect(weatherRuleText('humidity', { is: 'gte', to: 60 }, false)).toBe(
      'outdoor humidity is at least 60%',
    );
    expect(weatherRuleText('humidity', { is: 'lte', to: 60 }, false)).toBe(
      'outdoor humidity is at most 60%',
    );
    expect(weatherRuleText('humidity', { is: 'lt', to: 60 }, false)).toBe(
      'outdoor humidity is below 60%',
    );
  });

  it('words a range, moves between or is between', () => {
    const range = { is: 'between', min: 10, max: 20 } as const;
    expect(weatherRuleText('temperature', range, true)).toBe(
      'outdoor temperature moves between 10\u00a0°C and 20\u00a0°C',
    );
    expect(weatherRuleText('temperature', range, false)).toBe(
      'outdoor temperature is between 10\u00a0°C and 20\u00a0°C',
    );
  });

  it('keeps one decimal for rainfall and none for the rest', () => {
    expect(weatherRuleText('precipitation', { is: 'gt', to: 0.5 }, false)).toContain('0.5\u00a0mm');
    expect(weatherRuleText('uv_index', { is: 'gt', to: 6.4 }, false)).toBe('uv index is above 6');
  });
});

describe('weatherKindText', () => {
  it('lists the kinds with or, as a change or as a state', () => {
    expect(weatherKindText(['rain', 'snow'], true)).toBe('the weather turns to rain or snow');
    expect(weatherKindText(['storm'], false)).toBe('the weather is thunderstorm');
  });
});

describe('daylightText', () => {
  it('describes daytime between sunrise and sunset, night between sunset and sunrise', () => {
    expect(daylightText({ daylight: 'day' })).toBe('it is between sunrise and sunset');
    expect(daylightText({ daylight: 'night' })).toBe('it is between sunset and sunrise');
  });

  it('puts the offsets before or after each event', () => {
    expect(daylightText({ daylight: 'day', sunriseOffset: 30, sunsetOffset: -90 })).toBe(
      'it is between 30m after sunrise and 1h 30m before sunset',
    );
  });
});
