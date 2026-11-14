import { describe, expect, it } from 'vitest';
import type { AppHref } from '../components/app-href';
import {
  backTable,
  createBackOrigins,
  createBackRules,
  leafKeyOf,
  liveKeysOf,
  pathOf,
  type BackOrigins,
  type BackPage,
} from './back-rules';
import type { BackStep } from '../components/back-navigation';

const settings: AppHref = '/settings';
const assistant: AppHref = '/settings/assistant';
const integrations: AppHref = '/settings/assistant/integrations';
const tokens: AppHref = '/settings/assistant/tokens';
const connections: AppHref = '/settings/connections';
const devices: AppHref = '/devices';
const photos: AppHref = '/photos';
const drive: AppHref = '/drive';
const recent: AppHref = '/drive/recent';

const PAGES: readonly BackPage[] = [
  { href: settings, parent: null },
  { href: assistant, parent: settings },
  { href: integrations, parent: assistant },
  { href: tokens, parent: assistant },
  { href: connections, parent: settings },
  { href: devices, parent: null },
  { href: photos, parent: null },
  { href: drive, parent: null },
  { href: recent, parent: drive },
];

function setup(): {
  readonly rules: ReturnType<typeof createBackRules>;
  readonly visit: (key: string, pathname: string) => void;
  readonly close: (key: string) => void;
  readonly step: (pathname: string, key: string) => BackStep | null;
  readonly origins: BackOrigins;
} {
  const origins = createBackOrigins();
  const rules = createBackRules(backTable(PAGES), origins);
  const live = new Set<string>();
  let here = { key: '', pathname: '' };
  const visit = (key: string, pathname: string): void => {
    live.add(key);
    here = { key, pathname };
    origins.observe(key, pathname, new Set(live));
  };
  const close = (key: string): void => {
    live.delete(key);
    origins.observe(here.key, here.pathname, new Set(live));
  };
  const step = (pathname: string, key: string): BackStep | null =>
    rules.stepFor(pathname, rules.callerOf(key, pathname));
  return { rules, visit, close, step, origins };
}

describe('the page a back button returns to', () => {
  it('returns to the parent when the page was opened from its parent', () => {
    const { visit, step } = setup();
    visit('a', '/settings/assistant');
    visit('b', '/settings/assistant/integrations');
    expect(step('/settings/assistant/integrations', 'b')).toEqual({
      kind: 'parent',
      parent: assistant,
    });
  });

  it('returns to the page it was opened from when that is not the parent', () => {
    const { visit, step } = setup();
    visit('a', '/photos');
    visit('b', '/settings/assistant/integrations');
    expect(step('/settings/assistant/integrations', 'b')).toEqual({
      kind: 'caller',
      opener: { key: 'a', href: '/photos' },
      parent: assistant,
    });
  });

  it('returns to the parent after a deep link with no caller', () => {
    const { visit, step } = setup();
    visit('a', '/settings/assistant/integrations');
    expect(step('/settings/assistant/integrations', 'a')).toEqual({
      kind: 'parent',
      parent: assistant,
    });
  });

  it('returns to the sibling it was opened from', () => {
    const { visit, step } = setup();
    visit('a', '/settings/assistant/integrations');
    visit('b', '/settings/assistant/tokens');
    expect(step('/settings/assistant/tokens', 'b')?.kind).toBe('caller');
    expect(step('/settings/assistant/integrations', 'a')?.kind).toBe('parent');
  });

  it('returns to the parent, not the history, after coming back from a sibling', () => {
    const { rules, visit, step } = setup();
    visit('a', '/settings/assistant/integrations');
    visit('b', '/settings/assistant/tokens');
    rules.returned();
    visit('c', '/settings/assistant');
    expect(step('/settings/assistant', 'c')).toEqual({ kind: 'parent', parent: settings });
  });

  it('does not treat a revisit of an earlier page as a new caller', () => {
    const { visit, step } = setup();
    visit('a', '/settings/assistant');
    visit('b', '/photos');
    visit('a', '/settings/assistant');
    expect(step('/settings/assistant', 'a')).toEqual({ kind: 'parent', parent: settings });
  });

  it('follows each page back through a chain of callers', () => {
    const { visit, step } = setup();
    visit('a', '/photos');
    visit('b', '/settings/connections');
    visit('c', '/settings/assistant/tokens');
    expect(step('/settings/assistant/tokens', 'c')?.kind).toBe('caller');
    expect(step('/settings/connections', 'b')?.kind).toBe('caller');
    expect(step('/photos', 'a')).toBeNull();
  });

  it('has no back step on a root page even when it was opened from another page', () => {
    const { visit, step } = setup();
    visit('a', '/photos');
    visit('b', '/drive');
    expect(step('/drive', 'b')).toBeNull();
  });

  it('keeps a feature page below its tab root', () => {
    const { visit, step } = setup();
    visit('a', '/drive/recent');
    expect(step('/drive/recent', 'a')).toEqual({ kind: 'parent', parent: drive });
  });

  it('finds the nearest defined ancestor for a page without a definition', () => {
    const { visit, step } = setup();
    visit('a', '/settings/assistant/tokens/abc');
    expect(step('/settings/assistant/tokens/abc', 'a')).toEqual({
      kind: 'parent',
      parent: tokens,
    });
  });

  it('finds the section root for pages that live outside their tab path', () => {
    const { visit, step } = setup();
    visit('a', '/device/lamp');
    expect(step('/device/lamp', 'a')).toEqual({ kind: 'parent', parent: devices });
  });

  it('has no back step for an undefined page that was not opened from anywhere', () => {
    const { visit, step } = setup();
    visit('a', '/search');
    expect(step('/search', 'a')).toBeNull();
  });
});

describe('the bookkeeping of the opened-from pages', () => {
  it('notifies listeners only when an opener is recorded', () => {
    const { visit, origins } = setup();
    let calls = 0;
    origins.subscribe(() => {
      calls += 1;
    });
    visit('a', '/photos');
    visit('b', '/settings');
    visit('c', '/settings/connections');
    visit('d', '/settings/connections');
    expect(calls).toBe(2);
  });

  it('gives the same opener object for the same page every time', () => {
    const { rules, visit } = setup();
    visit('a', '/photos');
    visit('b', '/settings/connections');
    expect(rules.callerOf('b', '/settings/connections')).toBe(
      rules.callerOf('b', '/settings/connections'),
    );
  });

  it('forgets the opener of a page that left the navigation state', () => {
    const { rules, visit, close } = setup();
    visit('a', '/photos');
    visit('b', '/settings/connections');
    close('b');
    expect(rules.callerOf('b', '/settings/connections')).toBeNull();
  });

  it('tells whether an opener page is still open', () => {
    const { rules, visit, close } = setup();
    visit('a', '/photos');
    visit('b', '/settings/connections');
    expect(rules.isLive('a')).toBe(true);
    close('a');
    expect(rules.isLive('a')).toBe(false);
  });
});

describe('the helpers of the back rules', () => {
  it('writes nothing for a missing parameter', () => {
    expect(pathOf({ pathname: '/device/[id]', params: {} })).toBe('/device/');
  });

  it('collects every key of the navigation state', () => {
    const state = {
      routes: [{ key: 'k1' }, { key: 'k2', state: { routes: [{ key: 'k3' }] } }],
    };
    expect([...liveKeysOf(state)]).toEqual(['k1', 'k2', 'k3']);
  });

  it('writes a concrete path for a route with parameters', () => {
    expect(pathOf({ pathname: '/settings/[...page]', params: { page: ['plugins', 'abc'] } })).toBe(
      '/settings/plugins/abc',
    );
  });

  it('finds the deepest focused route key', () => {
    const state = {
      index: 1,
      routes: [
        { name: 'x', key: 'k1' },
        { name: 'y', key: 'k2', state: { index: 0, routes: [{ name: 'z', key: 'k3' }] } },
      ],
    };
    expect(leafKeyOf(state)).toBe('k3');
  });
});
