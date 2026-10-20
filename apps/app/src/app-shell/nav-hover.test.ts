import { describe, expect, it } from 'vitest';
import { hoverStep, noHover } from './nav-hover';

describe('hover over a drop target', () => {
  it('starts unarmed on a new candidate', () => {
    expect(hoverStep(noHover<string>(), { kind: 'over', candidate: 'a' })).toEqual({
      candidate: 'a',
      armed: false,
    });
  });

  it('arms the current candidate when the delay elapsed', () => {
    const over = hoverStep(noHover<string>(), { kind: 'over', candidate: 'a' });
    expect(hoverStep(over, { kind: 'elapsed' })).toEqual({ candidate: 'a', armed: true });
  });

  it('keeps the same state while the same candidate stays under the pointer', () => {
    const over = hoverStep(noHover<string>(), { kind: 'over', candidate: 'a' });
    expect(hoverStep(over, { kind: 'over', candidate: 'a' })).toBe(over);
    const armed = hoverStep(over, { kind: 'elapsed' });
    expect(hoverStep(armed, { kind: 'over', candidate: 'a' })).toBe(armed);
    expect(hoverStep(armed, { kind: 'elapsed' })).toBe(armed);
  });

  it('disarms and restarts when the candidate changes or goes away', () => {
    const armed = hoverStep(hoverStep(noHover<string>(), { kind: 'over', candidate: 'a' }), {
      kind: 'elapsed',
    });
    expect(hoverStep(armed, { kind: 'over', candidate: 'b' })).toEqual({
      candidate: 'b',
      armed: false,
    });
    expect(hoverStep(armed, { kind: 'over', candidate: null })).toEqual(noHover());
  });

  it('ignores an elapsed delay with no candidate', () => {
    const idle = noHover<string>();
    expect(hoverStep(idle, { kind: 'elapsed' })).toBe(idle);
  });
});
