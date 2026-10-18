import { describe, expect, it } from 'vitest';
import { railSummaryOf, type RailReadings } from './rail-summary';
import { PHONE_SECTION_IDS } from './sections';

const EMPTY: RailReadings = {
  battery: null,
  charging: false,
  dnd: null,
  doing: null,
  network: null,
  notificationCount: null,
  ringerMode: null,
  screenMinutes: null,
  storageFree: null,
};

describe('rail summaries', () => {
  it('shows nothing for a phone that has reported nothing', () => {
    for (const id of PHONE_SECTION_IDS) expect(railSummaryOf(id, EMPTY)).toBeNull();
  });

  it('shows the battery level and charging', () => {
    expect(railSummaryOf('battery', { ...EMPTY, battery: 62 })).toBe('62 %');
    expect(railSummaryOf('battery', { ...EMPTY, battery: 62, charging: true })).toBe(
      '62 % · charging',
    );
  });

  it('says Do not disturb before the ringer word', () => {
    const quiet = { ...EMPTY, ringerMode: 'vibrate' } as const;
    expect(railSummaryOf('sound', quiet)).toBe('Vibrate');
    expect(railSummaryOf('sound', { ...quiet, dnd: true })).toBe('Do not disturb');
  });

  it('shows screen time, the network, notifications and the activity word', () => {
    expect(railSummaryOf('screen', { ...EMPTY, screenMinutes: 192 })).toContain('3');
    expect(railSummaryOf('network', { ...EMPTY, network: 'Wi-Fi' })).toBe('Wi-Fi');
    expect(railSummaryOf('notifications', { ...EMPTY, notificationCount: 4 })).toBe('4');
    expect(
      railSummaryOf('activity', {
        ...EMPTY,
        doing: { state: 'walking', at: '2026-10-18T10:00:00.000Z' },
      }),
    ).toBe('Walking');
  });

  it('keeps Overview, Apps and Setup without a summary', () => {
    const full = { ...EMPTY, battery: 50, network: 'Wi-Fi', notificationCount: 2 };
    expect(railSummaryOf('overview', full)).toBeNull();
    expect(railSummaryOf('apps', full)).toBeNull();
    expect(railSummaryOf('setup', full)).toBeNull();
  });
});
