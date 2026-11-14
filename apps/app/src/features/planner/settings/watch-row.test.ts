import type { PlannerWatchLink, PlannerWatchState } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { watchSyncText } from './watch-row';

const WATCH = '7b0f5d9e-1c2a-4b3d-8e4f-5a6b7c8d9e0f';
const OTHER = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function link(state: PlannerWatchState, deviceId = WATCH): PlannerWatchLink {
  return { deviceId, alarmId: 1, hash: 'h', state, detail: null };
}

function alarms(...links: readonly PlannerWatchLink[]): { readonly watch: PlannerWatchLink[] }[] {
  return links.map((each) => ({ watch: [each] }));
}

describe('watchSyncText', () => {
  it('names a missing watch before anything else', () => {
    expect(watchSyncText({ watchId: null, sync: true, alarms: [] })).toBe('No watch');
  });

  it('says the alarms are not synced when sync is off', () => {
    expect(watchSyncText({ watchId: WATCH, sync: false, alarms: alarms(link('synced')) })).toBe(
      'Alarms not synced',
    );
  });

  it('puts alarms the watch did not save ahead of waiting ones', () => {
    const input = { watchId: WATCH, sync: true, alarms: alarms(link('pending'), link('failed')) };
    expect(watchSyncText(input)).toBe('1 not saved');
  });

  it('counts alarms waiting for the phone', () => {
    const input = { watchId: WATCH, sync: true, alarms: alarms(link('pending'), link('pending')) };
    expect(watchSyncText(input)).toBe('2 waiting');
  });

  it('counts only the links of this watch', () => {
    const input = {
      watchId: WATCH,
      sync: true,
      alarms: alarms(link('synced'), link('failed', OTHER), link('synced')),
    };
    expect(watchSyncText(input)).toBe('2 synced');
  });

  it('says sync is on while no alarm is linked yet', () => {
    expect(watchSyncText({ watchId: WATCH, sync: true, alarms: [] })).toBe('Sync on');
  });
});
