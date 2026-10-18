import { describe, expect, it } from 'vitest';
import { clock } from '../../../format/time';
import { heroOf } from './hero-model';
import { snapshotFixture, statusFixture } from './snapshot-fixture';

describe('heroOf', () => {
  it('says blocking is on, leads with the blocked share and keeps the counts in the facts', () => {
    const hero = heroOf(snapshotFixture());
    expect(hero).toMatchObject({ title: 'Ad blocking is on', tone: 'positive', stale: false });
    expect(hero.protection).toBe('on');
    expect(hero.figures).toEqual([{ label: 'Blocked', value: '18.4', unit: '%' }]);
    expect(hero.facts).toEqual(['6,420 of 30,604', 'last 24 hours', 'Answers in 14 ms']);
    expect(hero.ratio).toBeCloseTo(0.184, 5);
    expect(hero.line).toBe('18 % blocked');
    expect(hero.locked).toBeNull();
  });

  it('shows the resume time once, as a warning without figures, when paused', () => {
    const until = '2026-10-17T14:30:00.000Z';
    const hero = heroOf(
      snapshotFixture({ status: statusFixture({ protection: false, pausedUntil: until }) }),
    );
    expect(hero).toMatchObject({ title: 'Ad blocking is paused', tone: 'warning' });
    expect(hero.protection).toBe('paused');
    expect(hero.figures).toBeUndefined();
    expect(hero.facts).toEqual([`Until ${clock(until)}`, 'answers are not filtered']);
    expect(hero.line).toBe(`Paused until ${clock(until)}`);
  });

  it('says blocking is off until it is turned back on', () => {
    const hero = heroOf(snapshotFixture({ status: statusFixture({ protection: false }) }));
    expect(hero.title).toBe('Ad blocking is off');
    expect(hero.protection).toBe('off');
    expect(hero.facts[0]).toBe('Until you turn it back on');
  });

  it('goes neutral and locks the actions with the reason when AdGuard Home is unreachable', () => {
    const since = '2026-10-17T13:55:00.000Z';
    const hero = heroOf(
      snapshotFixture({ connection: { state: 'unreachable', reason: 'timed out', since } }),
    );
    expect(hero).toMatchObject({ stale: true, tone: 'neutral', protection: null });
    expect(hero.title).toBe(`Last reading ${clock(since)}`);
    expect(hero.facts).toEqual([
      'Last known: blocking was on',
      'can’t reach AdGuard Home right now',
    ]);
    expect(hero.locked).toBe('Can’t reach AdGuard Home right now');
    expect(hero.figures).toEqual([{ label: 'Blocked', value: '18.4', unit: '%' }]);
  });

  it('explains paused monitoring and the first connection without a stale reading', () => {
    expect(heroOf(snapshotFixture({ connection: { state: 'paused' } })).facts[1]).toBe(
      'monitoring is paused',
    );
    const connecting = heroOf(
      snapshotFixture({ connection: { state: 'connecting' }, status: null, stats: null }),
    );
    expect(connecting.title).toBe('Connecting…');
    expect(connecting.facts).toEqual(['Still connecting']);
    expect(connecting.figures).toBeUndefined();
  });

  it('has no figures while online without stats', () => {
    expect(heroOf(snapshotFixture({ stats: null })).figures).toBeUndefined();
  });
});
