import { describe, expect, it } from 'vitest';
import { WIDGET_FOOTPRINTS } from '@smarteverything/domain';
import { footprintOf } from './footprint';

describe('footprintOf', () => {
  it('uses the board footprint without an override', () => {
    expect(footprintOf('compact', 'W', undefined)).toStrictEqual(WIDGET_FOOTPRINTS.compact.W);
    expect(footprintOf('compact', 'W', {})).toStrictEqual(WIDGET_FOOTPRINTS.compact.W);
  });

  it('replaces only the rows of the named board and size', () => {
    const definition = { rows: { compact: { W: 3 } } };
    expect(footprintOf('compact', 'W', definition)).toStrictEqual({
      columns: WIDGET_FOOTPRINTS.compact.W.columns,
      rows: 3,
    });
    expect(footprintOf('compact', 'M', definition)).toStrictEqual(WIDGET_FOOTPRINTS.compact.M);
    expect(footprintOf('medium', 'W', definition)).toStrictEqual(WIDGET_FOOTPRINTS.medium.W);
  });
});
