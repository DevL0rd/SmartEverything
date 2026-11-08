import { describe, expect, it } from 'vitest';
import { check } from '../../src/check/check';
import { automation, context, lit, node, wired } from './c23-support';

describe('type mismatch wording', () => {
  it('names the input in words and says what it needs and gets', () => {
    const probe = node('p', 'probe.take', { need: lit('x'), count: wired('trigger.key') });
    const [found] = check(automation([probe]), context());
    expect(found?.message).toBe('The count input needs whole number from 0 to 9 but gets text.');
  });
});
