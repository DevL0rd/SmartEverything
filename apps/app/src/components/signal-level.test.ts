import { describe, expect, it } from 'vitest';
import { signalOf } from './signal-level';

describe('signalOf', () => {
  it('maps the dBm thresholds to four, three, two, one and no bars', () => {
    expect(signalOf(-30).bars).toBe(4);
    expect(signalOf(-55).bars).toBe(4);
    expect(signalOf(-56).bars).toBe(3);
    expect(signalOf(-67).bars).toBe(3);
    expect(signalOf(-68).bars).toBe(2);
    expect(signalOf(-75).bars).toBe(2);
    expect(signalOf(-76).bars).toBe(1);
    expect(signalOf(-85).bars).toBe(1);
    expect(signalOf(-86).bars).toBe(0);
  });

  it('calls three or four bars good, two fair and fewer weak', () => {
    expect(signalOf(-52).quality).toBe('good');
    expect(signalOf(-60).quality).toBe('good');
    expect(signalOf(-70).quality).toBe('fair');
    expect(signalOf(-80).quality).toBe('weak');
    expect(signalOf(-95).quality).toBe('weak');
  });

  it('words the label with the quality and the signed reading', () => {
    expect(signalOf(-52).label).toBe('Signal good, −52 dBm');
    expect(signalOf(-80).label).toBe('Signal weak, −80 dBm');
  });

  it('shows no bars and says so when there is no reading', () => {
    expect(signalOf(null)).toEqual({ bars: 0, quality: 'weak', label: 'No signal reading' });
  });
});
