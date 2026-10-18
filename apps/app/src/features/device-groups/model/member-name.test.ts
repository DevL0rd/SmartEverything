import { describe, expect, it } from 'vitest';
import { memberNameOf } from './member-name';

describe('the name of a member in a result', () => {
  const members = [{ id: 'a', label: 'Hall lamp' }];

  it('is the label of the member', () => {
    expect(memberNameOf(members, 'a')).toBe('Hall lamp');
  });

  it('says a removed device instead of showing its id', () => {
    expect(memberNameOf(members, '7b000000-0000-4000-8000-000000000009')).toBe('A removed device');
  });
});
