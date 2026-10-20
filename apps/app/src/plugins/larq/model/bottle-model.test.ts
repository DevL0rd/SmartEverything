import { describe, expect, it } from 'vitest';
import {
  ageLine,
  batteryLine,
  bindingNotice,
  bottleOfPerson,
  isStale,
  lastDrinkLine,
  levelLine,
  paceOf,
  ringProgress,
  stateChipOf,
  todaySummary,
} from './bottle-model';
import { NOW, statusOf } from './fixtures';

const plain = (text: string): string => text.replaceAll('\u00a0', ' ');

const capOf = (changes: Record<string, unknown>): Record<string, unknown> => ({
  ...statusOf().cap,
  ...changes,
});

describe('bottle state chip', () => {
  it('says asleep for a bottle seen a few minutes ago', () => {
    expect(stateChipOf(statusOf(), NOW).label).toBe('Asleep');
  });

  it('says not seen, not asleep, once the bottle was silent for over a day', () => {
    const view = statusOf({ lastSeenAt: '2026-10-16T21:14:00+02:00' });
    expect(isStale(view, NOW)).toBe(true);
    expect(stateChipOf(view, NOW).label).toBe('Not seen');
  });

  it.each([
    [{ fault: 'uv_led_open' }, 'Fault'],
    [{ cleaning: true }, 'Cleaning'],
    [{ interlock: true }, 'Cap off'],
    [{ charging: 'charging' }, 'Charging'],
    [{ charging: 'charged' }, 'Charged'],
    [{ locked: true }, 'Locked'],
    [{ lowBattery: true }, 'Battery low'],
  ])('shows %j as %s', (changes, label) => {
    expect(stateChipOf(statusOf({ cap: capOf(changes) }), NOW).label).toBe(label);
  });

  it('puts a fault before every other cap state', () => {
    const cap = capOf({ fault: 'uv_overtemp', cleaning: true, charging: 'charging' });
    expect(stateChipOf(statusOf({ cap }), NOW).label).toBe('Fault');
  });

  it.each([
    ['syncing', 'Syncing'],
    ['sync_failed', 'Sync failed'],
    ['no_phone', 'No phone'],
    ['synced', 'Awake'],
  ])('shows the link %s as %s', (link, label) => {
    expect(stateChipOf(statusOf({ link }), NOW).label).toBe(label);
  });

  it('says drinking when the bottle is awake and a drink just happened', () => {
    const view = statusOf({
      link: 'synced',
      cap: capOf({ state: 'hydration_reminder' }),
      today: { ...statusOf().today, lastDrinkAt: '2026-10-18T15:40:00+02:00' },
    });
    expect(stateChipOf(view, NOW).label).toBe('Drinking');
  });

  it('says awake, not asleep, while the cap light is on', () => {
    const view = statusOf({ cap: capOf({ state: 'hydration_reminder' }) });
    expect(stateChipOf(view, NOW).label).toBe('Awake');
  });

  it('shows setting up while the first backfill is pending', () => {
    expect(stateChipOf(statusOf({ firstSyncPending: true }), NOW).label).toBe('Setting up');
  });
});

describe('bottle age line', () => {
  it('names how long ago the bottle synced', () => {
    expect(ageLine(statusOf(), NOW)).toBe('Synced 12 min ago');
  });

  it('names when a silent bottle was last seen', () => {
    const view = statusOf({ lastSeenAt: '2026-10-16T21:14:00+02:00' });
    expect(ageLine(view, NOW)).toContain('Not seen since');
  });

  it('says so when it was never seen', () => {
    expect(ageLine(statusOf({ lastSeenAt: null }), NOW)).toBe('Not seen yet');
  });
});

describe('bottle pace', () => {
  const today = statusOf().today;

  it('says on pace when nothing is expected yet', () => {
    expect(paceOf(today, 400)).toMatchObject({ expectedMl: 0, text: 'On pace' });
  });

  it('works out how far behind the day is', () => {
    const pace = paceOf(today, 15 * 60 + 42);
    expect(pace.expectedMl).toBe(Math.round(2600 * ((942 - 420) / 900)));
    expect(plain(pace.text)).toBe(
      `${(pace.expectedMl - 1075).toLocaleString('en-US')} ml behind pace`,
    );
  });

  it('says ahead once the day is past the pace line', () => {
    expect(paceOf({ ...today, totalMl: 2000 }, 600).text).toContain('ahead');
  });

  it('caps the expectation at the goal after the pace window', () => {
    expect(paceOf(today, 1400).expectedMl).toBe(2600);
  });

  it('turns the day into a ring share and a spoken summary', () => {
    expect(ringProgress(today)).toBeCloseTo(1075 / 2600);
    expect(plain(todaySummary(today, paceOf(today, 942)))).toMatch(
      /^Today 1,075 ml of 2,600 ml, .* behind pace\.$/,
    );
    expect(plain(todaySummary(today, paceOf(today, 100)))).toBe('Today 1,075 ml of 2,600 ml.');
  });
});

describe('bottle figures', () => {
  it('words the level, battery and last drink', () => {
    expect(plain(levelLine(statusOf()))).toBe('520 ml in the bottle');
    expect(batteryLine(statusOf())).toBe('Battery 82% · about 23 days left');
    expect(lastDrinkLine(statusOf(), NOW)).toBe('Last drink 1 h ago');
  });

  it('does not invent figures that are unknown', () => {
    const level = { ml: null, pct: null, at: null, reliable: false, quality: null };
    expect(levelLine(statusOf({ level }))).toBe('Level unknown');
    expect(batteryLine(statusOf({ cap: capOf({ batteryPct: null }) }))).toBe('Battery unknown');
    expect(batteryLine(statusOf({ cap: capOf({ daysLeft: null }) }))).toBe('Battery 82%');
  });
});

describe('bottle binding notice', () => {
  it('asks the bound person only while the notice is pending', () => {
    expect(bindingNotice(statusOf())).toBeNull();
    const notice = bindingNotice(statusOf({ noticePending: true, boundBy: 'Anna' }));
    expect(notice?.title).toBe('Anna linked this bottle to you');
    expect(notice?.body).toContain('water log and Health Connect');
  });
});

describe('the bottle that is yours', () => {
  const ida = { id: 'ida', details: { personId: 'ida-profile' } };
  const owner = { id: 'owner', details: { personId: 'owner-profile' } };
  const nobody = { id: 'nobody', details: { personId: null } };

  it('picks the bottle bound to you whatever the order', () => {
    expect(bottleOfPerson([ida, owner], 'owner-profile')?.id).toBe('owner');
    expect(bottleOfPerson([owner, ida], 'ida-profile')?.id).toBe('ida');
  });

  it('falls back to a bottle nobody owns yet, never to someone else’s', () => {
    expect(bottleOfPerson([ida, nobody], 'owner-profile')?.id).toBe('nobody');
    expect(bottleOfPerson([ida], 'owner-profile')).toBeNull();
  });

  it('takes only an unbound bottle when you have no profile', () => {
    expect(bottleOfPerson([ida, nobody], null)?.id).toBe('nobody');
    expect(bottleOfPerson([ida], null)).toBeNull();
    expect(bottleOfPerson([], 'owner-profile')).toBeNull();
  });
});
