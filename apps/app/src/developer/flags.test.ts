import { describe, expect, it } from 'vitest';
import { activateFlag, activateFlags, readDeveloperFlags } from './flags';
import { allOff } from './toggles';

describe('developer flags', () => {
  it('reads the latest snapshot after every activation', () => {
    activateFlags(allOff());
    const before = readDeveloperFlags();
    activateFlag('log.debug', true);
    expect(readDeveloperFlags()['log.debug']).toBe(true);
    expect(before['log.debug']).toBe(false);
    activateFlags(allOff());
    expect(readDeveloperFlags()['log.debug']).toBe(false);
  });
});
