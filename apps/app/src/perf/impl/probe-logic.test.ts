import { describe, expect, it } from 'vitest';
import { ActionLog } from './actions';
import { CommitLog } from './commits';
import { NavTracker } from './nav';
import { pathOf } from './globals';

describe('ActionLog', () => {
  it('describes the actions around a stall with offsets from its start', () => {
    const log = new ActionLog();
    log.note('tap', '', 900);
    log.note('store', 'chats', 1010);
    log.note('net', '/chats', 5000);
    expect(log.contextOf(1000, 1200)).toEqual(['tap@-100', 'store:chats@10']);
  });
});

describe('CommitLog', () => {
  it('sums commits in a span and names the heaviest', () => {
    const log = new CommitLog();
    log.add(100, 10, 'A');
    log.add(200, 40, 'B');
    log.add(900, 5, 'C');
    expect(log.span(50, 300)).toEqual({ ms: 50, count: 2, top: 'B' });
    expect(log.span(1000, 2000)).toEqual({ ms: 0, count: 0, top: '' });
  });
});

describe('NavTracker', () => {
  it('uses the dispatch time when a navigation started it', () => {
    const nav = new NavTracker();
    nav.begin(1000, 'a');
    nav.mounted(1040);
    expect(nav.arrive(1100, 'a')).toEqual({ start: 1000, from: 'a', toMount: 40 });
  });

  it('starts at arrival when nothing announced the navigation', () => {
    const nav = new NavTracker();
    expect(nav.arrive(5000, 'a')).toEqual({ start: 5000, from: 'a', toMount: null });
  });

  it('forgets a navigation that is older than the window', () => {
    const nav = new NavTracker();
    nav.begin(0, 'a');
    expect(nav.arrive(10_000, 'b').start).toBe(10_000);
  });
});

describe('pathOf', () => {
  it('drops the host and query and masks ids', () => {
    expect(
      pathOf('http://192.168.1.2:7880/devices/8f14e45f-ceea-467a-9575-1cd2cb2a3f6b/state?x=1'),
    ).toBe('/devices/:id/state');
    expect(pathOf('/chats/123/messages')).toBe('/chats/:n/messages');
  });
});
