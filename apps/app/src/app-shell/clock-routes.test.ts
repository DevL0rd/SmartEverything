import { NAV_SECTIONS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { href } from './hrefs';
import { mainPageSettings } from './main-pages';
import { landing, leafParams } from './route-landing.test-util';
import { ROUTES, TAB_ROUTES } from './routes';
import { TAB_NAMES } from './tab-names';

const CLOCK_SECTIONS = ['index', 'timers', 'stopwatch', 'world'] as const;

describe('clock links', () => {
  it('open every section inside the Clock tab section switcher', () => {
    expect(landing('/clock')).toBe('(clock) > clock/(sections) > index');
    for (const section of CLOCK_SECTIONS.filter((name) => name !== 'index')) {
      expect(landing(`/clock/${section}`)).toBe(`(clock) > clock/(sections) > ${section}`);
    }
  });

  it('keep the ring screen as a push on the Clock stack', () => {
    expect(landing('/clock/ring/r1')).toBe('(clock) > clock/ring/[ringId]');
    expect(leafParams('/clock/ring/r1')).toEqual({ ringId: 'r1' });
  });

  it('stay inside the assistant when a ring opens from a chat', () => {
    const chat = ['(app)', '(z-assistant)', 'assistant/chat/[chatId]'];
    expect(landing('/clock/ring/r1', chat)).toBe('(z-assistant) > clock/ring/[ringId]');
  });

  it('open the Clock tab from any other tab', () => {
    expect(landing('/clock/world', ['(app)', '(home)', 'index'])).toBe(
      '(clock) > clock/(sections) > world',
    );
  });

  it('have no clock pages left under the Planner', () => {
    expect(landing('/planner/clock/alarms')).not.toContain('clock/(sections)');
    expect(landing('/planner/ring/r1')).not.toContain('ring/[ringId]');
  });
});

describe('clock entry points', () => {
  it('sits right after Planner in the navigation', () => {
    expect(NAV_SECTIONS.indexOf('clock')).toBe(NAV_SECTIONS.indexOf('planner') + 1);
    expect(TAB_NAMES.indexOf('(clock)')).toBe(TAB_NAMES.indexOf('(planner)') + 1);
  });

  it('is found by its clock words with the alarm clock icon', () => {
    const route = TAB_ROUTES.find((entry) => entry.tab === 'clock');
    expect(route?.icon).toBe('alarmClock');
    expect(route?.keywords).toEqual([
      'alarm',
      'timer',
      'stopwatch',
      'world clock',
      'wake',
      'snooze',
    ]);
  });

  it('registers every section but the first as a page under the Clock tab', () => {
    const pages = ROUTES.filter((route) => route.parent === 'clock');
    expect(pages.map((route) => route.key)).toEqual([
      'clock-timers',
      'clock-stopwatch',
      'clock-world',
    ]);
    expect(pages.map((route) => route.href)).toEqual(
      CLOCK_SECTIONS.filter((name) => name !== 'index').map((name) => `/clock/${name}`),
    );
    expect(pages.every((route) => route.tab === 'clock')).toBe(true);
  });

  it('opens the Planner settings page, where the Clock group lives', () => {
    expect(mainPageSettings('clock')).toEqual({
      href: href.settings.page('planner'),
      label: 'Planner settings',
    });
  });

  it('puts the Clock pages on matching hrefs', () => {
    expect(href.clock.alarms()).toBe('/clock');
    expect(href.clock.timers()).toBe('/clock/timers');
    expect(href.clock.stopwatch()).toBe('/clock/stopwatch');
    expect(href.clock.world()).toBe('/clock/world');
    expect(href.clock.ring('r1')).toStrictEqual({
      pathname: '/clock/ring/[ringId]',
      params: { ringId: 'r1' },
    });
  });
});
