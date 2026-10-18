import { describe, expect, it } from 'vitest';
import { revealedAt, settledSpans } from './tab-spans';

const KEYS = ['a', 'b', 'c'];

describe('settledSpans', () => {
  it('waits until every tab has reported, so mount commits once', () => {
    const measured = { a: { x: 0, width: 80 }, b: { x: 80, width: 80 } };
    expect(settledSpans(KEYS, measured, {})).toBeNull();
  });

  it('commits all tabs together once the last one reports', () => {
    const measured = {
      a: { x: 0, width: 80 },
      b: { x: 80, width: 80 },
      c: { x: 160, width: 90 },
    };
    expect(settledSpans(KEYS, measured, {})).toEqual(measured);
  });

  it('commits nothing when a report repeats what is already known', () => {
    const known = {
      a: { x: 0, width: 80 },
      b: { x: 80, width: 80 },
      c: { x: 160, width: 90 },
    };
    expect(settledSpans(KEYS, known, known)).toBeNull();
  });

  it('commits again when one tab changes width', () => {
    const known = {
      a: { x: 0, width: 80 },
      b: { x: 80, width: 80 },
      c: { x: 160, width: 90 },
    };
    const wider = { ...known, a: { x: 0, width: 100 } };
    expect(settledSpans(KEYS, wider, known)).toEqual(wider);
  });

  it('drops spans of tabs that are gone', () => {
    const measured = {
      a: { x: 0, width: 80 },
      b: { x: 80, width: 80 },
      c: { x: 160, width: 90 },
    };
    expect(settledSpans(['a', 'c'], measured, measured)).toEqual({
      a: measured.a,
      c: measured.c,
    });
  });
});

describe('revealedAt', () => {
  const spans = {
    a: { x: 0, width: 100 },
    b: { x: 100, width: 100 },
    c: { x: 200, width: 100 },
  };

  it('stays at the start when the tab already fits', () => {
    expect(revealedAt(spans, spans.a, 250)).toBe(0);
  });

  it('scrolls so the tab ends at the right edge, snapped to a tab start', () => {
    expect(revealedAt(spans, spans.c, 250)).toBe(100);
  });
});
