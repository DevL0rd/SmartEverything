import { describe, expect, it } from 'vitest';
import { safeReason } from './safe-reason';

describe('the safe update failure reason', () => {
  it('drops a bearer header and the raw token from an updater error', () => {
    const error = new Error(
      'Request failed {"authorization":"Bearer abc.def-ghi","x":1} abc.def-ghi',
    );
    const reason = safeReason(error, 'abc.def-ghi');
    expect(reason).not.toMatch(/bearer abc/i);
    expect(reason).not.toContain('abc.def-ghi');
  });

  it('keeps a plain message and reads non-errors', () => {
    expect(safeReason(new Error('Disk full'), null)).toBe('Disk full');
    expect(safeReason('offline', 'token')).toBe('offline');
  });
});
