import { describe, expect, it } from 'vitest';
import { noCostReported } from './cost-note';

describe('a reply with no cost', () => {
  it('is labelled when the provider answered and reported zero', () => {
    expect(noCostReported({ model: 'a/b', cost_micros: 0 })).toBe(true);
  });

  it('is not labelled when the provider cost is simply unavailable', () => {
    expect(noCostReported({ model: 'a/b', cost_micros: 0, cost_incomplete: true })).toBe(false);
  });

  it('is not labelled when something was charged', () => {
    expect(noCostReported({ model: 'a/b', cost_micros: 1200 })).toBe(false);
  });

  it('is not labelled for a message no model produced', () => {
    expect(noCostReported({ model: null, cost_micros: 0 })).toBe(false);
  });
});
