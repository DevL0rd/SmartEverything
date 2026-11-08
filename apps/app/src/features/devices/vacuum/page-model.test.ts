import { describe, expect, it } from 'vitest';
import { SHOW_ACTIONS, VACUUM_TABS, nextReveal, revealOfParam, revealSeqOf } from './page-model';

describe('vacuum page model', () => {
  it('lists the five tabs in the designed order with unique keys', () => {
    expect(VACUUM_TABS.map((tab) => tab.label)).toStrictEqual([
      'Clean',
      'Schedule',
      'History',
      'Care',
      'Settings',
    ]);
    expect(new Set(VACUUM_TABS.map((tab) => tab.key)).size).toBe(VACUUM_TABS.length);
  });

  it('offers Rooms and Zones next to the commands', () => {
    expect(SHOW_ACTIONS.map((action) => action.label)).toStrictEqual(['Rooms', 'Zones']);
  });

  it('gives each press a new request so the same card can be shown again', () => {
    const first = nextReveal(null, 'rooms');
    const again = nextReveal(first, 'rooms');
    expect(again.seq).toBeGreaterThan(first.seq);
    expect(revealSeqOf(again, 'rooms')).toBe(again.seq);
    expect(revealSeqOf(again, 'zones')).toBeNull();
    expect(revealSeqOf(null, 'rooms')).toBeNull();
  });

  it('opens the page on the card a link names and nothing for a link without one', () => {
    expect(revealOfParam('rooms')).toStrictEqual({ target: 'rooms', seq: 1 });
    expect(revealOfParam(undefined)).toBeNull();
    expect(revealOfParam('elsewhere')).toBeNull();
  });
});
