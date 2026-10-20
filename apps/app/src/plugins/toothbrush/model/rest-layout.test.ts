import { describe, expect, it } from 'vitest';
import { restBesideBrush } from './rest-layout';

describe('restBesideBrush', () => {
  it('stacks the status under the brush in a narrow card', () => {
    expect(restBesideBrush(0)).toBe(false);
    expect(restBesideBrush(372)).toBe(false);
    expect(restBesideBrush(559)).toBe(false);
  });

  it('puts the status beside the brush once the card is wide enough', () => {
    expect(restBesideBrush(560)).toBe(true);
    expect(restBesideBrush(960)).toBe(true);
  });
});
