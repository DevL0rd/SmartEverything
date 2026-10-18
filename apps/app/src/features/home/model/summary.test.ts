import { describe, expect, it } from 'vitest';
import type { MetricReading } from '../../climate';
import { homeSummary } from './summary';

function reading(
  metric: MetricReading['metric'],
  overrides: Partial<MetricReading>,
): MetricReading {
  return {
    metric,
    label: metric,
    amount: 0,
    value: '0',
    unit: null,
    verdict: 'Fine',
    tone: 'positive',
    stale: false,
    ...overrides,
  };
}

describe('the Home summary line', () => {
  it('joins the indoor temperature and the air verdict', () => {
    const summary = homeSummary(
      [
        reading('temperature', { value: '21.5', unit: '°C' }),
        reading('pm25', { verdict: 'Good air' }),
      ],
      0,
    );
    expect(summary.facts).toBe('21.5\u00a0°C inside · Good air');
  });

  it('leaves out a stale reading', () => {
    const summary = homeSummary(
      [
        reading('temperature', { value: '21.5', unit: '°C', stale: true }),
        reading('pm25', { verdict: 'Poor air' }),
      ],
      0,
    );
    expect(summary.facts).toBe('Poor air');
  });

  it('has no facts when nothing fresh is known', () => {
    expect(homeSummary([], 0).facts).toBeNull();
    expect(homeSummary([reading('pm25', { stale: true })], 0).facts).toBeNull();
  });

  it('passes the offline count through', () => {
    expect(homeSummary([], 3).offline).toBe(3);
  });
});
