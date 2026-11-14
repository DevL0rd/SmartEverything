import { describe, expect, it } from 'vitest';
import { CARD_FIT_START, cardFitAfter, slotFits, type CardMeasure } from './card-fit';

function after(...measures: readonly CardMeasure[]): ReturnType<typeof cardFitAfter> {
  return measures.reduce(cardFitAfter, CARD_FIT_START);
}

describe('cardFitAfter', () => {
  it('shows a slot only once its room and need are known and the need fits', () => {
    expect(slotFits(after({ part: 'graph', side: 'room', px: 40 }).graph)).toBe(false);
    const fits = after(
      { part: 'graph', side: 'room', px: 40 },
      { part: 'graph', side: 'need', px: 40.4 },
    );
    expect(slotFits(fits.graph)).toBe(true);
    const tight = after(
      { part: 'ticker', side: 'room', px: 18 },
      { part: 'ticker', side: 'need', px: 24 },
    );
    expect(slotFits(tight.ticker)).toBe(false);
  });

  it('keeps every slot apart', () => {
    const fit = after({ part: 'graph', side: 'need', px: 30 });
    expect(fit.ticker).toBe(CARD_FIT_START.ticker);
    expect(fit.log).toBe(CARD_FIT_START.log);
    expect(fit.band).toBe(CARD_FIT_START.band);
  });

  it('keeps the same fit when a measure repeats', () => {
    const fit = after({ part: 'graph', side: 'room', px: 40 });
    expect(cardFitAfter(fit, { part: 'graph', side: 'room', px: 40 })).toBe(fit);
    expect(cardFitAfter(fit, { part: 'log', measure: { kind: 'got', px: 20 } })).toBe(fit);
    expect(cardFitAfter(fit, { part: 'band', layout: { width: 240, height: 48, row: 48 } })).toBe(
      fit,
    );
  });

  it('turns the band compact when it wraps', () => {
    const fit = after({ part: 'band', layout: { width: 240, height: 104, row: 48 } });
    expect(fit.band.compactBelow).toBe(241);
  });
});
