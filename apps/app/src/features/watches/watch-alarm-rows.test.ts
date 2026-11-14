import { describe, expect, it } from 'vitest';
import type { WatchAlarm } from '@smarteverything/domain';
import { alarmEditorOf, alarmKey, clockLinkTextOf, shownStateOf } from './watch-alarm-rows';

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

describe('alarmEditorOf', () => {
  it('edits on the watch page only while alarm sync is off', () => {
    expect(alarmEditorOf(false)).toBe('watch');
    expect(alarmEditorOf(true)).toBe('clock');
  });

  it('keeps the editor closed while the sync preference is not known yet', () => {
    expect(alarmEditorOf(null)).toBe('clock');
  });
});

describe('clockLinkTextOf', () => {
  it('says where the alarms are changed for each sync state', () => {
    expect(clockLinkTextOf(true)).toBe('Synced both ways, change them in Clock');
    expect(clockLinkTextOf(false)).toBe('Not synced, the watch keeps its own alarms');
    expect(clockLinkTextOf(null)).toBeNull();
  });
});

describe('shownStateOf', () => {
  it('says whether a read-only watch alarm is on and whether it wakes smartly', () => {
    expect(shownStateOf({ enabled: true, smart: true })).toBe('On · Smart wake');
    expect(shownStateOf({ enabled: false, smart: false })).toBe('Off');
  });
});
