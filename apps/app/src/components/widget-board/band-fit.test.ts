import { describe, expect, it } from 'vitest';
import { BAND_FIT_START, bandFitAfter, isCompact, oneRowBand } from './band-fit';

const ROW = 48;

describe('oneRowBand', () => {
  it('keeps the action band on one row in the short tiers only', () => {
    expect(oneRowBand('m')).toBe(true);
    expect(oneRowBand('w')).toBe(true);
    expect(oneRowBand('xs')).toBe(true);
    expect(oneRowBand('l')).toBe(false);
    expect(oneRowBand('xl')).toBe(false);
    expect(oneRowBand(null)).toBe(false);
  });
});

describe('bandFitAfter', () => {
  it('stays full while the band fits one row', () => {
    const fit = bandFitAfter(BAND_FIT_START, { width: 240, height: 48, row: ROW });
    expect(isCompact(fit)).toBe(false);
  });

  it('keeps the same fit while the band has never wrapped', () => {
    expect(bandFitAfter(BAND_FIT_START, { width: 240, height: 48, row: ROW })).toBe(BAND_FIT_START);
  });

  it('turns compact when the full band wraps onto a second row', () => {
    const fit = bandFitAfter(BAND_FIT_START, { width: 240, height: 104, row: ROW });
    expect(isCompact(fit)).toBe(true);
  });

  it('stays compact once the compact band fits one row at the same width', () => {
    const wrapped = bandFitAfter(BAND_FIT_START, { width: 240, height: 104, row: ROW });
    const fit = bandFitAfter(wrapped, { width: 240, height: 48, row: ROW });
    expect(isCompact(fit)).toBe(true);
  });

  it('tries the full band again when the band gets wider', () => {
    const wrapped = bandFitAfter(BAND_FIT_START, { width: 240, height: 104, row: ROW });
    const fit = bandFitAfter(wrapped, { width: 400, height: 48, row: ROW });
    expect(isCompact(fit)).toBe(false);
  });
});
