import { describe, expect, it } from 'vitest';
import type { WatchAlarm } from '@smarteverything/domain';
import { alarmKey } from './watch-alarm-rows';

function alarm(id: WatchAlarm['id'], time: string): WatchAlarm {
  return { id, enabled: true, time, days: [], smart: false };
}

describe('alarmKey', () => {
  it('gives two unsaved alarms at the same time different keys', () => {
    const unsaved = [alarm(null, '07:00'), alarm(null, '07:00')];
    const keys = unsaved.map((each, index) => alarmKey(each, index));
    expect(new Set(keys).size).toBe(2);
  });

  it('keeps a saved alarm under its id wherever it sits in the list', () => {
    const saved = alarm(3, '07:00');
    expect(alarmKey(saved, 0)).toBe(alarmKey(saved, 4));
  });
});
