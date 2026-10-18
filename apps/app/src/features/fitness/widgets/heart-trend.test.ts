import { describe, expect, it } from 'vitest';
import { glanceOf } from '../model/glance';
import { heartTrendRequest } from './heart-trend';

describe('heartTrendRequest', () => {
  it('judges the resting heart rate by lower being better', () => {
    expect(heartTrendRequest(true, '2026-10-10')).toStrictEqual({
      metric: 'resting_heart_rate',
      day: '2026-10-10',
      days: 14,
      better: 'lower',
    });
  });

  it('colours the average heart rate delta neutral, up or down', () => {
    const request = heartTrendRequest(false, '2026-10-10');
    expect(request.better).toBe('neither');
    const rows = [
      { day: '2026-10-08', metric: 'heart_rate_average', value: 70 },
      { day: '2026-10-09', metric: 'heart_rate_average', value: 70 },
      { day: '2026-10-10', metric: 'heart_rate_average', value: 90 },
    ];
    expect(glanceOf(rows, request).delta?.tone).toBe('neutral');
  });
});
