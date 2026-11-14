import { NAV_SECTIONS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PLANNER_SECTION_ROUTES } from '../features/planner/model/section-routes';
import { href } from './hrefs';
import { mainPageSettings } from './main-pages';
import { landing, leafParams } from './route-landing.test-util';
import { ROUTES, TAB_ROUTES } from './routes';
import { TAB_NAMES } from './tab-names';

describe('planner links', () => {
  it('open every section inside the Planner tab section switcher', () => {
    expect(landing('/planner')).toBe('(planner) > planner/(sections) > index');
    for (const section of PLANNER_SECTION_ROUTES.filter((name) => name !== 'index')) {
      expect(landing(`/planner/${section}`)).toBe(`(planner) > planner/(sections) > ${section}`);
    }
  });

  it('keep an item as a push on the Planner stack', () => {
    expect(landing('/planner/item/i1')).toBe('(planner) > planner/item/[itemId]');
    expect(leafParams('/planner/item/i1')).toEqual({ itemId: 'i1' });
  });

  it('stay inside the assistant when an item opens from a chat', () => {
    const chat = ['(app)', '(z-assistant)', 'assistant/chat/[chatId]'];
    expect(landing('/planner/item/i1', chat)).toBe('(z-assistant) > planner/item/[itemId]');
  });

  it('open the Planner tab from any other tab', () => {
    expect(landing('/planner/calendar', ['(app)', '(home)', 'index'])).toBe(
      '(planner) > planner/(sections) > calendar',
    );
  });
});

describe('planner entry points', () => {
  it('lists the sections in the order of the section switcher', () => {
    expect(PLANNER_SECTION_ROUTES).toEqual(['index', 'tasks', 'calendar', 'insights']);
  });

  it('sits after Fitness and before Clock in the navigation', () => {
    expect(NAV_SECTIONS.indexOf('planner')).toBe(NAV_SECTIONS.indexOf('fitness') + 1);
    expect(TAB_NAMES.indexOf('(planner)')).toBe(TAB_NAMES.indexOf('(fitness)') + 1);
    expect(NAV_SECTIONS.indexOf('clock')).toBe(NAV_SECTIONS.indexOf('planner') + 1);
  });

  it('is found by its calendar words and has no clock words', () => {
    const route = TAB_ROUTES.find((entry) => entry.tab === 'planner');
    expect(route?.icon).toBe('calendar');
    expect(route?.keywords).toEqual(['calendar', 'tasks', 'reminders', 'schedule', 'agenda']);
  });

  it('registers every section but the first as a page under the Planner tab', () => {
    const pages = ROUTES.filter((route) => route.parent === 'planner');
    expect(pages.map((route) => route.key)).toEqual([
      'planner-tasks',
      'planner-calendar',
      'planner-insights',
    ]);
    expect(pages.map((route) => route.href)).toEqual(
      PLANNER_SECTION_ROUTES.filter((name) => name !== 'index').map((name) => `/planner/${name}`),
    );
    expect(pages.every((route) => route.tab === 'planner')).toBe(true);
  });

  it('opens the Planner settings page from its header', () => {
    expect(mainPageSettings('planner')).toEqual({
      href: href.settings.page('planner'),
      label: 'Planner settings',
    });
  });

  it('puts the Planner pages on matching hrefs', () => {
    expect(href.planner.index()).toBe('/planner');
    expect(href.planner.tasks()).toBe('/planner/tasks');
    expect(href.planner.calendar()).toBe('/planner/calendar');
    expect(href.planner.insights()).toBe('/planner/insights');
    expect(href.planner.item('i1', null)).toStrictEqual({
      pathname: '/planner/item/[itemId]',
      params: { itemId: 'i1' },
    });
    expect(href.planner.item('i1', '2026-11-14')).toStrictEqual({
      pathname: '/planner/item/[itemId]',
      params: { itemId: 'i1', occurrence: '2026-11-14' },
    });
  });
});
