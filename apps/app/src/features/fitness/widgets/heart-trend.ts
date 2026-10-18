import type { GlanceRequest } from '../model/glance';

const DAYS = 14;

export function heartTrendRequest(resting: boolean, day: string): GlanceRequest {
  return resting
    ? { metric: 'resting_heart_rate', day, days: DAYS, better: 'lower' }
    : { metric: 'heart_rate_average', day, days: DAYS, better: 'neither' };
}
