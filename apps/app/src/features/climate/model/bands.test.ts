import { describe, expect, it } from 'vitest';
import { BANDS, comparable, dialFor, zoneOf, type ComfortMetric } from './bands';
import { metricColour } from './metric-look';
import type { MetricReading } from './comfort';

const METRICS: readonly ComfortMetric[] = ['temperature', 'humidity', 'pm25', 'co2'];

function reading(metric: ComfortMetric, amount: number, unit: string | null = null): MetricReading {
  return {
    metric,
    label: metric,
    amount,
    value: String(amount),
    unit,
    verdict: '',
    tone: 'info',
    stale: false,
  };
}

function dialColourAt(
  metric: ComfortMetric,
  unit: string | null,
  value: number,
): string | undefined {
  return dialFor(metric, unit).bands.find((band) => value <= band.upTo)?.colour;
}

function sampled(metric: ComfortMetric): readonly number[] {
  const { min, max } = BANDS[metric];
  return Array.from({ length: 101 }, (_, step) => min + ((max - min) * (step + 0.37)) / 101);
}

describe('one band table per metric', () => {
  it.each(METRICS)('paints the %s dial with the colour of the zone the verdict names', (metric) => {
    for (const value of sampled(metric)) {
      expect(dialColourAt(metric, null, value)).toBe(zoneOf(BANDS[metric], value).colour);
    }
  });

  it('judges the temperature the same on a Fahrenheit dial as on a Celsius one', () => {
    for (const celsius of sampled('temperature')) {
      const fahrenheit = (celsius * 9) / 5 + 32;
      expect(dialColourAt('temperature', '°F', fahrenheit)).toBe(
        zoneOf(BANDS.temperature, comparable(fahrenheit, '°F')).colour,
      );
    }
  });

  it('puts the Fahrenheit dial on the same degrees as the Celsius one', () => {
    expect(dialFor('temperature', '°F')).toMatchObject({ min: 50, max: 95 });
    expect(dialFor('temperature', '°C')).toMatchObject({ min: 10, max: 35 });
  });

  it('agrees on where comfortable starts across verdict, colour and dial', () => {
    expect(zoneOf(BANDS.temperature, 18.9).verdict).toBe('Cool');
    expect(zoneOf(BANDS.temperature, 19).verdict).toBe('Comfortable');
    expect(metricColour(reading('temperature', 18.9))).toBe('temp-cool');
    expect(metricColour(reading('temperature', 19.5))).toBe('temp-warm');
    expect(dialColourAt('temperature', null, 18.5)).toBe('temp-cool');
    expect(dialColourAt('temperature', null, 19.5)).toBe('positive');
  });

  it('turns humidity and carbon dioxide at the same value in verdict and dial', () => {
    expect(zoneOf(BANDS.humidity, 34).verdict).toBe('Dry');
    expect(dialColourAt('humidity', null, 34)).toBe('warning');
    expect(zoneOf(BANDS.humidity, 36).verdict).toBe('Comfortable');
    expect(dialColourAt('humidity', null, 36)).toBe('humidity');
    expect(zoneOf(BANDS.co2, 900).tone).toBe('positive');
    expect(dialColourAt('co2', null, 900)).toBe('positive');
    expect(zoneOf(BANDS.co2, 1001).tone).toBe('warning');
    expect(zoneOf(BANDS.co2, 1300).tone).toBe('critical');
    expect(dialColourAt('co2', null, 1300)).toBe('critical');
  });

  it('takes the fine dust zones from the domain air bands', () => {
    expect(zoneOf(BANDS.pm25, 12).verdict).toBe('Good air');
    expect(zoneOf(BANDS.pm25, 12.1).verdict).toBe('Fair air');
    expect(zoneOf(BANDS.pm25, 300).verdict).toBe('Severe pollution');
    expect(dialFor('pm25', null).bands).toHaveLength(5);
    expect(dialFor('pm25', null).max).toBe(250.4);
  });

  it('keeps the metric colour for humidity and carbon dioxide whatever the verdict', () => {
    expect(metricColour(reading('humidity', 10))).toBe('humidity');
    expect(metricColour(reading('co2', 1500))).toBe('viz-6');
  });
});
