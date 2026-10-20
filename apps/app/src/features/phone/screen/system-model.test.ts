import { PHONE_SETTINGS_PAGES, PHONE_SYSTEM_TOGGLES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { phoneReadingsOf } from '../phone-values';
import { RADIO_ROWS, TOGGLE_ROWS, radioSpoken, radioStateOf, type RadioRow } from './system-model';

const AT = '2026-10-18T10:00:00Z';

function reported(readings: Record<string, boolean>): ReturnType<typeof phoneReadingsOf> {
  return phoneReadingsOf(
    Object.fromEntries(
      Object.entries(readings).map(([key, value]) => [key, { value, observedAt: AT }]),
    ),
  );
}

describe('the system switch rows', () => {
  it('has one row for each toggle the phone can write, in the domain order', () => {
    expect(TOGGLE_ROWS.map((row) => row.capability)).toEqual([...PHONE_SYSTEM_TOGGLES]);
  });

  it('reads each row from its own reported value', () => {
    const readings = reported({ auto_rotate: true, haptic_feedback: false, touch_sounds: true });
    expect(TOGGLE_ROWS.map((row) => row.reading(readings))).toEqual([true, false, true]);
  });
});

describe('the radio rows', () => {
  it('open only pages the phone can open', () => {
    for (const row of RADIO_ROWS) expect(PHONE_SETTINGS_PAGES).toContain(row.page);
    expect(new Set(RADIO_ROWS.map((row) => row.page)).size).toBe(RADIO_ROWS.length);
  });

  it('reads Wi-Fi, Bluetooth, location and airplane mode from their own values', () => {
    const readings = reported({
      wifi_on: true,
      bluetooth_on: false,
      location_on: false,
      airplane_mode: true,
    });
    expect(RADIO_ROWS.map((row) => row.reading(readings))).toEqual([true, false, false, true]);
  });

  it('says on, off or nothing when the phone has not reported', () => {
    expect(radioStateOf(true)).toEqual({ label: 'On', tone: 'positive' });
    expect(radioStateOf(false)).toEqual({ label: 'Off', tone: 'neutral' });
    expect(radioStateOf(null)).toBeNull();
  });

  it('speaks each state for a screen reader', () => {
    const wifi = RADIO_ROWS.find((row): row is RadioRow => row.key === 'wifi');
    if (wifi === undefined) throw new Error('the Wi-Fi row exists');
    expect(radioSpoken(wifi, true)).toBe('Wi-Fi: on');
    expect(radioSpoken(wifi, false)).toBe('Wi-Fi: off');
    expect(radioSpoken(wifi, null)).toBe('Wi-Fi: not reported');
  });
});
