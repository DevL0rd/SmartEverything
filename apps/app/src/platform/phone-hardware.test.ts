import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { hardwareReportOf, phoneHardwareOf } from './phone-hardware';

describe('phone hardware', () => {
  it('reports the model and maker Android gives the app', () => {
    expect(
      phoneHardwareOf({
        Model: 'SM-F966B',
        Manufacturer: 'samsung',
        Brand: 'samsung',
        Version: 36,
      }),
    ).toEqual({ model: 'SM-F966B', manufacturer: 'samsung' });
  });

  it('reports nothing when a value is missing, blank or not text', () => {
    expect(phoneHardwareOf(undefined)).toBeUndefined();
    expect(phoneHardwareOf({ Model: 'SM-X926B' })).toBeUndefined();
    expect(phoneHardwareOf({ Model: '  ', Manufacturer: 'samsung' })).toBeUndefined();
    expect(phoneHardwareOf({ Model: 5, Manufacturer: 'samsung' })).toBeUndefined();
  });

  it('produces a body the push registration accepts', () => {
    const hardware = phoneHardwareOf({ Model: 'SM-X926B', Manufacturer: 'samsung' });
    expect(
      E.savePushTarget.body.safeParse({ token: 't', platform: 'android', hardware }).success,
    ).toBe(true);
  });

  it('carries the hardware on a phone report that needs no push token', () => {
    const hardware = phoneHardwareOf({ Model: 'SM-X926B', Manufacturer: 'samsung' });
    expect(hardware).toBeDefined();
    if (hardware === undefined) return;
    const report = hardwareReportOf(hardware, new Date('2026-10-25T10:00:00.000Z'));
    expect(E.reportPhone.body.parse(report).hardware).toEqual(hardware);
  });
});
