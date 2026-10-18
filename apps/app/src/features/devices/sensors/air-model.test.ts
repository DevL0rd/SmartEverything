import { describe, expect, it } from 'vitest';
import { airBandColour, airStateText, airStateTone, PM25_BANDS, PM25_GAUGE_MAX } from './air-model';

describe('purifier air gauge', () => {
  it('uses the domain PM2.5 bands and stops at the gauge maximum', () => {
    expect(PM25_BANDS.map((band) => [band.upTo, band.colour])).toEqual([
      [12, 'air-good'],
      [35.4, 'air-fair'],
      [55.4, 'air-moderate'],
      [PM25_GAUGE_MAX, 'air-poor'],
    ]);
  });

  it('words the state from the reading and power, keeping the last reading when offline', () => {
    expect(airStateText(8, 'Good air', 'on')).toBe('Good air');
    expect(airStateText(8, 'Good air', 'off')).toBe('Off · Good air');
    expect(airStateText(null, '', 'off')).toBe('Off');
    expect(airStateText(null, '', 'on')).toBe('Waiting for the first reading');
    expect(airStateText(8, 'Good air', 'offline')).toBe('Good air');
    expect(airStateText(null, '', 'offline')).toBe('No reading yet');
  });

  it('colours the sparkline with the band of the current reading', () => {
    expect(airBandColour(8)).toBe('air-good');
    expect(airBandColour(88)).toBe('air-poor');
    expect(airBandColour(300)).toBe('air-severe');
    expect(airBandColour(null)).toBe('on-surface-variant');
  });

  it('tones the state word by band while running and neutral otherwise', () => {
    expect(airStateTone(8, 'on')).toBe('positive');
    expect(airStateTone(45, 'on')).toBe('warning');
    expect(airStateTone(88, 'on')).toBe('critical');
    expect(airStateTone(8, 'off')).toBe('variant');
    expect(airStateTone(8, 'offline')).toBe('variant');
    expect(airStateTone(null, 'on')).toBe('variant');
  });
});
