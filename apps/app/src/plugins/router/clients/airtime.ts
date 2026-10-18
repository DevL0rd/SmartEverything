type AirtimeTone = 'info' | 'warning' | 'critical';

export interface Airtime {
  readonly tone: AirtimeTone;
  readonly word: 'Clear' | 'Busy' | 'Very busy';
}

const BUSY_ABOVE = 60;
const VERY_BUSY_ABOVE = 85;

export function airtimeOf(busyPercent: number): Airtime {
  if (busyPercent > VERY_BUSY_ABOVE) {
    return { tone: 'critical', word: 'Very busy' };
  }
  return busyPercent > BUSY_ABOVE
    ? { tone: 'warning', word: 'Busy' }
    : { tone: 'info', word: 'Clear' };
}
