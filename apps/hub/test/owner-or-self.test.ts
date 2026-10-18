import { describe, expect, it } from 'vitest';
import { isOwnerOrSelf, ownerOrSelf } from '../src/server/auth';

describe('owner or self', () => {
  it('lets an owner act for anyone and a member only for themselves', () => {
    expect(isOwnerOrSelf('owner', false)).toBe(true);
    expect(isOwnerOrSelf('member', true)).toBe(true);
    expect(isOwnerOrSelf('member', false)).toBe(false);
  });

  it('refuses another person’s thing with one wording', () => {
    expect(() => {
      ownerOrSelf('member', true);
    }).not.toThrow();
    expect(() => {
      ownerOrSelf('owner', false);
    }).not.toThrow();
    expect(() => {
      ownerOrSelf('member', false);
    }).toThrow(
      expect.objectContaining({
        code: 'forbidden',
        message: 'Only an owner can do this for another person.',
      }),
    );
  });
});
