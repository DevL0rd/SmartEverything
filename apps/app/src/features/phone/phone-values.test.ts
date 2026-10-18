import { describe, expect, it } from 'vitest';
import type { DeviceValues } from '../../store/state';
import { doingIcon, phoneReadingsOf } from './phone-values';

function values(readings: Record<string, DeviceValues[string]['value']>): DeviceValues {
  return Object.fromEntries(
    Object.entries(readings).map(([key, value]) => [
      key,
      { value, observedAt: '2026-10-16T10:00:00Z' },
    ]),
  );
}

describe('phoneReadingsOf', () => {
  it('has nothing for a phone that reported nothing', () => {
    const readings = phoneReadingsOf({});
    expect(readings).toMatchObject({
      battery: null,
      charging: false,
      doing: null,
      network: null,
      screenMinutes: null,
      nowPlaying: null,
      reportedAt: null,
      charger: null,
      ringing: null,
      flashlight: null,
      volumes: { media: null, ring: null, alarm: null, notification: null },
    });
    expect(Object.values(readings).filter((reading) => reading === undefined)).toEqual([]);
  });

  it('reads battery, charging, screen time and what is playing', () => {
    const readings = phoneReadingsOf(
      values({ battery: 64, charging: true, screen_time_today: 95, now_playing: 'Song' }),
    );
    expect(readings).toMatchObject({
      battery: 64,
      charging: true,
      screenMinutes: 95,
      nowPlaying: 'Song',
    });
  });

  it('treats a wrong type as missing and an empty title as nothing playing', () => {
    const readings = phoneReadingsOf(values({ battery: '64', charging: 'yes', now_playing: '' }));
    expect(readings).toMatchObject({ battery: null, charging: false, nowPlaying: null });
  });

  it('names each network in plain words and ignores one it does not know', () => {
    const network = (value: string): string | null =>
      phoneReadingsOf(values({ network: value })).network;
    expect(network('wifi')).toBe('Wi-Fi');
    expect(network('cellular')).toBe('Mobile data');
    expect(network('offline')).toBe('Offline');
    expect(network('satellite')).toBeNull();
  });

  it('reports what the phone owner is doing with the time it was seen, but not when unknown', () => {
    expect(phoneReadingsOf(values({ phone_context: 'walking' })).doing).toEqual({
      state: 'walking',
      at: '2026-10-16T10:00:00Z',
    });
    expect(phoneReadingsOf(values({ phone_context: 'unknown' })).doing).toBeNull();
    expect(phoneReadingsOf(values({ phone_context: 'flying' })).doing).toBeNull();
  });
});

describe('phoneReadingsOf for the values added with the phone page', () => {
  const FULL = values({
    network: 'cellular',
    signal_strength: 3,
    charger: 'wireless',
    charge_full_at: '2026-10-16T12:40:00Z',
    battery_temperature: 31.5,
    power_save: true,
    thermal_state: 'moderate',
    ringer_mode: 'vibrate',
    dnd: true,
    volume: 40,
    ring_volume: 70,
    alarm_volume: 80,
    notification_volume: 55,
    audio_output: 'bluetooth',
    playback: 'playing',
    in_call: true,
    ringing: false,
    screen_on: true,
    brightness: 35,
    auto_brightness: false,
    flashlight: 'on',
    storage_free: 41_000_000_000,
    notification_count: 4,
    next_alarm: '2026-10-17T06:30:00Z',
    place: 'Home',
    context_confidence: 90,
  });

  it('reads every sound, screen, power and storage value in its own words', () => {
    expect(phoneReadingsOf(FULL)).toMatchObject({
      networkKind: 'cellular',
      signalBars: 3,
      charger: 'wireless',
      chargeFullAt: '2026-10-16T12:40:00Z',
      temperature: 31.5,
      powerSave: true,
      thermal: 'moderate',
      ringerMode: 'vibrate',
      dnd: true,
      volumes: { media: 40, ring: 70, alarm: 80, notification: 55 },
      audioOutput: 'bluetooth',
      playback: 'playing',
      inCall: true,
      ringing: false,
      screenOn: true,
      brightness: 35,
      autoBrightness: false,
      flashlight: 'on',
      storageFree: 41_000_000_000,
      notificationCount: 4,
      nextAlarm: '2026-10-17T06:30:00Z',
      place: 'Home',
      confidence: 90,
    });
  });

  it('keeps an empty next alarm and a hidden place as nothing', () => {
    const readings = phoneReadingsOf(
      values({ next_alarm: null, place: null, charge_full_at: null }),
    );
    expect(readings).toMatchObject({ nextAlarm: null, place: null, chargeFullAt: null });
  });

  it('ignores a value of the wrong kind instead of guessing', () => {
    const readings = phoneReadingsOf(
      values({ charger: 'plasma', flashlight: 'dim', signal_strength: 9, ringing: 'yes' }),
    );
    expect(readings).toMatchObject({
      charger: null,
      flashlight: null,
      signalBars: null,
      ringing: null,
    });
  });

  it('says when the phone last reported by its newest value', () => {
    const readings = phoneReadingsOf({
      battery: { value: 60, observedAt: '2026-10-16T09:00:00Z' },
      ringing: { value: false, observedAt: '2026-10-16T11:42:00Z' },
      dnd: { value: false, observedAt: '2026-10-16T10:00:00Z' },
    });
    expect(readings.reportedAt).toBe('2026-10-16T11:42:00Z');
  });
});

describe('doingIcon', () => {
  it('shows a car for driving, navigating and parked, and feet for anything else', () => {
    const icon = (
      state: 'driving' | 'navigating' | 'parked' | 'walking' | 'still',
    ): 'car' | 'footprints' => doingIcon({ state, at: '' });
    expect(icon('driving')).toBe('car');
    expect(icon('navigating')).toBe('car');
    expect(icon('parked')).toBe('car');
    expect(icon('walking')).toBe('footprints');
    expect(icon('still')).toBe('footprints');
  });
});
