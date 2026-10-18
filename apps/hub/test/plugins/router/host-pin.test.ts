import { describe, expect, it } from 'vitest';
import {
  forgetHostKey,
  pinHostKey,
  pinnedFingerprint,
} from '../../../src/plugins/builtin/router/host-pin';
import { memoryRecords } from '../memory-records';

describe('router host key pin', () => {
  it('returns the fingerprint pinned for the same host', () => {
    const records = memoryRecords();
    pinHostKey(records, '192.168.50.1', 'SHA256:first');
    expect(pinnedFingerprint(records, '192.168.50.1')).toBe('SHA256:first');
  });

  it('pins nothing for a different host, so the new host is pinned on first connect', () => {
    const records = memoryRecords();
    pinHostKey(records, '192.168.50.1', 'SHA256:first');
    expect(pinnedFingerprint(records, '192.168.1.1')).toBeNull();
    pinHostKey(records, '192.168.1.1', 'SHA256:second');
    expect(pinnedFingerprint(records, '192.168.1.1')).toBe('SHA256:second');
    expect(pinnedFingerprint(records, '192.168.50.1')).toBeNull();
  });

  it('pins nothing after the setup is saved again', () => {
    const records = memoryRecords();
    pinHostKey(records, '192.168.50.1', 'SHA256:first');
    forgetHostKey(records);
    expect(pinnedFingerprint(records, '192.168.50.1')).toBeNull();
  });

  it('pins nothing when the stored value is not a host and fingerprint pair', () => {
    expect(
      pinnedFingerprint(memoryRecords({ host_key: 'SHA256:legacy' }), '192.168.50.1'),
    ).toBeNull();
    expect(pinnedFingerprint(memoryRecords(), '192.168.50.1')).toBeNull();
  });
});
