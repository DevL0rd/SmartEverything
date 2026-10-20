import { describe, expect, it } from 'vitest';
import { shadeAt, type DrawnShades } from './draw-shades';

const SHADES: DrawnShades = [
  { through: 0.25, colour: 'green' },
  { through: 0.6, colour: 'amber' },
  { through: Number.POSITIVE_INFINITY, colour: 'red' },
];

describe('shadeAt', () => {
  it('takes the colour of the first shade the share has not passed', () => {
    expect([0, 0.25, 0.26, 0.6, 0.61, 1].map((share) => shadeAt(SHADES, share))).toEqual([
      'green',
      'green',
      'amber',
      'amber',
      'red',
      'red',
    ]);
  });

  it('keeps the last colour for a share beyond every shade', () => {
    expect(
      shadeAt(
        [
          { through: 0.5, colour: 'green' },
          { through: 0.9, colour: 'red' },
        ],
        2,
      ),
    ).toBe('red');
  });
});
