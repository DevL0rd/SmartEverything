import { describe, expect, it } from 'vitest';
import { targetNamesOf } from './use-environment';

describe('target names', () => {
  it('knows every device, room and group a target can point at', () => {
    const names = targetNamesOf({
      device: new Map([['d1', 'Hall light']]),
      room: new Map([['r1', 'Hall']]),
      group: new Map([['g1', 'Every light']]),
    });
    expect([...names]).toEqual([
      ['d1', 'Hall light'],
      ['r1', 'Hall'],
      ['g1', 'Every light'],
    ]);
  });
});
