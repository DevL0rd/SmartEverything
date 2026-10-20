import type { TelevisionSettingsRow } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { wakeAddressOf, wakeAddressRequest, wakeAddressRow } from './wake-address';

const SET: TelevisionSettingsRow = {
  device_id: 'tv-1',
  direct_host: null,
  direct_mac: null,
  input_names: {},
  wake_macs: ['a1:b2:c3:d4:e5:f6'],
  wake_worked_at: null,
};

const worked = (moment: string): string => `at ${moment}`;

describe('the wake address row', () => {
  it('asks for an address when the screen has none', () => {
    expect(wakeAddressRow(null, worked)).toMatchObject({ value: 'Not set', tone: 'warning' });
    expect(wakeAddressRow({ ...SET, wake_macs: [] }, worked).value).toBe('Not set');
  });

  it('shows the address in capitals and whether a wake has worked yet', () => {
    expect(wakeAddressRow(SET, worked)).toStrictEqual({
      value: 'A1:B2:C3:D4:E5:F6',
      subtitle: 'The hub has not woken this screen yet',
      tone: 'variant',
    });
    expect(
      wakeAddressRow({ ...SET, wake_worked_at: '2026-10-18T12:00:00.000Z' }, worked),
    ).toStrictEqual({
      value: 'A1:B2:C3:D4:E5:F6',
      subtitle: 'Last woke the screen at 2026-10-18T12:00:00.000Z',
      tone: 'positive',
    });
  });

  it('reads the stored address', () => {
    expect(wakeAddressOf(SET)).toBe('A1:B2:C3:D4:E5:F6');
    expect(wakeAddressOf(null)).toBeNull();
  });
});

describe('editing the wake address', () => {
  it('starts from the stored address and says where to find it on the TV', () => {
    const request = wakeAddressRequest(SET, vi.fn());
    expect(request.initial).toBe('A1:B2:C3:D4:E5:F6');
    expect(request.helper).toMatch(/Network Status, IP Settings/);
    expect(request.allowEmpty).toBe(true);
  });

  it('refuses text that is not a MAC address and accepts dashes or capitals', () => {
    const request = wakeAddressRequest(null, vi.fn());
    expect(request.problemOf?.('192.168.1.40')).not.toBeNull();
    expect(request.problemOf?.('A1:B2:C3:D4:E5')).not.toBeNull();
    expect(request.problemOf?.('A1-B2-C3-D4-E5-F6')).toBeNull();
  });

  it('saves a normalised address and clears it with an empty field', async () => {
    const save = vi.fn(() => Promise.resolve());
    const request = wakeAddressRequest(null, save);
    await request.save('A1-B2-C3-D4-E5-F6');
    await request.save('');
    expect(save.mock.calls).toStrictEqual([['a1:b2:c3:d4:e5:f6'], [null]]);
  });
});
