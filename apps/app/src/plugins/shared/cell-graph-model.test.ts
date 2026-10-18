import { describe, expect, it } from 'vitest';
import { domainOf } from './cell-graph-model';

describe('domainOf', () => {
  it('shares one ceiling between the lines so they compare', () => {
    expect(
      domainOf([
        [
          { t: 1, v: 2 },
          { t: 2, v: 9 },
        ],
        [{ t: 1, v: 4 }],
      ]),
    ).toEqual([0, 9]);
  });

  it('keeps a flat zero line drawable', () => {
    expect(domainOf([[{ t: 1, v: 0 }]])).toEqual([0, 1]);
  });
});
