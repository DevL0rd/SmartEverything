import { describe, expect, it } from 'vitest';
import { DISC, hazeFill } from './haze';

describe('hazeFill', () => {
  it('fades a radial gradient from the strength at the centre to nothing at the edge', () => {
    expect(hazeFill({ cx: 50, cy: 46, rx: 46, ry: 40 }, '#336699', 0.75)).toEqual({
      experimental_backgroundImage:
        'radial-gradient(ellipse 46% 40% at 50% 46%, rgba(51, 102, 153, 0.75) 0%, rgba(51, 102, 153, 0) 100%)',
    });
  });

  it('fills a whole box with a disc centred in it', () => {
    expect(hazeFill(DISC, '#336699', 0.6).experimental_backgroundImage).toContain(
      'ellipse 50% 50% at 50% 50%',
    );
  });
});
