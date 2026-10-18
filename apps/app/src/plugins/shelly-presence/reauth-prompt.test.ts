import { describe, expect, it } from 'vitest';
import { presenceFixture } from './presence-fixture';
import { needsPassword } from './reauth-prompt';

describe('needsPassword', () => {
  it('offers the password prompt to the owner of a sensor that needs authentication', () => {
    const sensor = presenceFixture();
    const locked = { ...sensor, connection: { state: 'needs_auth' as const, reason: null } };
    expect(needsPassword(locked, true)).toBe(true);
    expect(needsPassword(locked, false)).toBe(false);
    expect(needsPassword(sensor, true)).toBe(false);
  });
});
