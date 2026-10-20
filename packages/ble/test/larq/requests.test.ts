import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_REQUESTS,
  LarqFrameError,
  NEVER_SENT_REQUESTS,
  READ_REQUESTS,
  WRITE_REQUESTS,
  LOG_REQUESTS,
  isAllowedRequest,
  logRequest,
  readRequest,
  requestNameOfFrame,
  setQuietRequest,
  setReminderRequest,
  setTimeRequest,
  uvRequest,
} from '../../src';

const SOURCE = join(import.meta.dirname, '../../src/larq');

describe('LARQ request allowlist', () => {
  it('lists every read and write the app uses and nothing else', () => {
    expect(ALLOWED_REQUESTS).toStrictEqual([...READ_REQUESTS, ...WRITE_REQUESTS]);
    expect(WRITE_REQUESTS).toStrictEqual([
      'RequestSetCapTimeSettings',
      'RequestSetCapHydroReminderSettings',
      'RequestSetCapDoNotDisturbSettings',
      'RequestSetCapUvActivate',
    ]);
  });

  it('never overlaps the requests that can brick the cap', () => {
    for (const never of NEVER_SENT_REQUESTS) {
      expect(isAllowedRequest(never)).toBe(false);
    }
    expect(NEVER_SENT_REQUESTS).toContain('RequestCapEnterDfuMode');
    expect(NEVER_SENT_REQUESTS).toContain('RequestSetCapPowerSavingMode');
  });

  it('builds every read request and names it correctly', () => {
    for (const name of READ_REQUESTS) {
      expect(requestNameOfFrame(readRequest(1, name))).toBe(name);
    }
  });

  it('keeps the dangerous request names out of every source file except the list that refuses them', () => {
    const files = readdirSync(SOURCE).filter((file) => file.endsWith('.ts') && file !== 'names.ts');
    for (const file of files) {
      const text = readFileSync(join(SOURCE, file), 'utf8');
      for (const never of NEVER_SENT_REQUESTS) {
        expect(text, `${file} mentions ${never}`).not.toContain(never);
      }
      expect(text, `${file} mentions the DFU service`).not.toMatch(/fe59/iu);
    }
  });

  it('has one request for each of the six logs', () => {
    expect(Object.keys(LOG_REQUESTS)).toHaveLength(6);
    for (const request of Object.values(LOG_REQUESTS)) {
      expect(isAllowedRequest(request)).toBe(true);
    }
    expect(requestNameOfFrame(logRequest(1, 'charging_adc', 5, 3))).toBe(
      'RequestGetChargingCapAdcLog',
    );
  });
});

describe('LARQ request values', () => {
  it('starts and stops UV by mode, writing the mode even for stop', () => {
    expect(uvRequest(1, 'stop').toHex().endsWith('12020803')).toBe(true);
    expect(uvRequest(1, 'normal').toHex().endsWith('12020801')).toBe(true);
    expect(uvRequest(1, 'adventure').toHex().endsWith('12020802')).toBe(true);
  });

  it('writes quiet hours as state, start and stop', () => {
    const frame = setQuietRequest(4, {
      state: 'on',
      startSeconds: 82_800,
      stopSeconds: 25_200,
      snoozeMinutes: 0,
    });
    expect(frame.toHex().endsWith('120e0a0c080115704301001d70620000')).toBe(true);
  });

  it('refuses a time, a window or a colour outside what the cap takes', () => {
    const base = {
      state: 'interval_fixed' as const,
      startSeconds: 28_800,
      stopSeconds: 79_200,
      intervalSeconds: 3600,
      colour: { red: 1, green: 1, blue: 1 },
    };
    expect(() => setTimeRequest(1, 0)).toThrow(LarqFrameError);
    expect(() => setReminderRequest(1, { ...base, startSeconds: 0 })).toThrow(LarqFrameError);
    expect(() => setReminderRequest(1, { ...base, stopSeconds: 86_401 })).toThrow(LarqFrameError);
    expect(() => setReminderRequest(1, { ...base, intervalSeconds: -1 })).toThrow(LarqFrameError);
    expect(() =>
      setReminderRequest(1, { ...base, colour: { red: 1.1, green: 0, blue: 0 } }),
    ).toThrow(/red part/u);
    expect(() => logRequest(1, 'tof', 0, 11)).toThrow(LarqFrameError);
    expect(() => logRequest(1, 'tof', -1, 5)).toThrow(LarqFrameError);
    expect(() =>
      setQuietRequest(1, { state: 'on', startSeconds: 1, stopSeconds: 2, snoozeMinutes: 1.5 }),
    ).toThrow(LarqFrameError);
  });
});
