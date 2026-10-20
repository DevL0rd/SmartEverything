import {
  APP_EVENT,
  APP_EVENT_TITLE_LONGEST,
  type WindowRow,
  type WindowsState,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { AppEventTracker } from '../../src/node/app-events';

const FIREFOX = { id: 'firefox.desktop', name: 'Firefox' };
const KATE = { id: 'org.kde.kate', name: 'Kate' };

function window(
  id: string,
  app: WindowRow['app'],
  over: Partial<Pick<WindowRow, 'title' | 'focused' | 'minimised'>> = {},
): WindowRow {
  return {
    id,
    title: over.title ?? `${id} title`,
    app,
    desktop: null,
    minimised: over.minimised ?? false,
    focused: over.focused ?? false,
  };
}

function state(...windows: WindowRow[]): WindowsState {
  return { windows };
}

function kinds(
  tracker: AppEventTracker,
  next: WindowsState,
  locked: boolean | null = null,
): string[] {
  return tracker.observe(next, locked).events.map((event) => `${event.kind}:${event.app.name}`);
}

describe('app events from the window list', () => {
  it('reports the apps already open as a baseline, with the one in front', () => {
    const tracker = new AppEventTracker();
    const batch = tracker.observe(
      state(window('1', FIREFOX), window('2', KATE, { focused: true })),
      null,
    );
    expect(batch.baseline).toBe(true);
    expect(batch.events.map((event) => `${event.kind}:${event.app.name}`)).toEqual([
      'opened:Firefox',
      'opened:Kate',
      'focused:Kate',
    ]);
  });

  it('reports an app opening when its first window appears and closing when its last goes', () => {
    const tracker = new AppEventTracker();
    tracker.observe(state(), null);
    expect(kinds(tracker, state(window('1', FIREFOX)))).toEqual(['opened:Firefox']);
    expect(tracker.observe(state(window('1', FIREFOX)), null).events).toEqual([]);
    expect(kinds(tracker, state())).toEqual(['closed:Firefox']);
  });

  it('says nothing while an app opens or closes one of several windows', () => {
    const tracker = new AppEventTracker();
    tracker.observe(state(window('1', FIREFOX)), null);
    expect(kinds(tracker, state(window('1', FIREFOX), window('2', FIREFOX)))).toEqual([]);
    expect(kinds(tracker, state(window('2', FIREFOX)))).toEqual([]);
  });

  it('keeps an app open while only a minimised window remains', () => {
    const tracker = new AppEventTracker();
    tracker.observe(state(window('1', FIREFOX, { focused: true })), null);
    expect(kinds(tracker, state(window('1', FIREFOX, { minimised: true })))).toEqual([
      'unfocused:Firefox',
    ]);
  });

  it('reports focus moving from one app to another, the old one first', () => {
    const tracker = new AppEventTracker();
    tracker.observe(state(window('1', FIREFOX, { focused: true }), window('2', KATE)), null);
    expect(
      kinds(tracker, state(window('1', FIREFOX), window('2', KATE, { focused: true }))),
    ).toEqual(['unfocused:Firefox', 'focused:Kate']);
  });

  it('reports the app that was in front as unfocused before it closes', () => {
    const tracker = new AppEventTracker();
    tracker.observe(state(window('1', FIREFOX, { focused: true }), window('2', KATE)), null);
    expect(kinds(tracker, state(window('2', KATE, { focused: true })))).toEqual([
      'unfocused:Firefox',
      'closed:Firefox',
      'focused:Kate',
    ]);
  });

  it('reports a new app opening and coming to the front in one step in order', () => {
    const tracker = new AppEventTracker();
    tracker.observe(state(window('1', FIREFOX, { focused: true })), null);
    expect(
      kinds(tracker, state(window('1', FIREFOX), window('2', KATE, { focused: true }))),
    ).toEqual(['unfocused:Firefox', 'opened:Kate', 'focused:Kate']);
  });

  it('treats a locked screen as nothing being in front and restores focus on unlock', () => {
    const tracker = new AppEventTracker();
    const open = state(window('1', FIREFOX, { focused: true }));
    tracker.observe(open, false);
    expect(kinds(tracker, open, true)).toEqual(['unfocused:Firefox']);
    expect(kinds(tracker, open, false)).toEqual(['focused:Firefox']);
  });

  it('ignores windows that belong to no app', () => {
    const tracker = new AppEventTracker();
    tracker.observe(state(), null);
    expect(kinds(tracker, state(window('1', null, { focused: true })))).toEqual([]);
  });

  it('carries the title of the window in front, else the first one', () => {
    const tracker = new AppEventTracker();
    const batch = tracker.observe(
      state(
        window('1', FIREFOX, { title: 'Back tab' }),
        window('2', FIREFOX, { title: 'Front tab', focused: true }),
        window('3', KATE, { title: '' }),
      ),
      null,
    );
    expect(batch.events.map((event) => [event.app.name, event.title])).toEqual([
      ['Firefox', 'Front tab'],
      ['Kate', null],
      ['Firefox', 'Front tab'],
    ]);
  });

  it('starts over with a new baseline after a reset', () => {
    const tracker = new AppEventTracker();
    const open = state(window('1', FIREFOX));
    tracker.observe(open, null);
    tracker.reset();
    const batch = tracker.observe(open, null);
    expect(batch.baseline).toBe(true);
    expect(batch.events.map((event) => event.kind)).toEqual(['opened']);
  });

  it('cuts a very long title to what the hub accepts', () => {
    const tracker = new AppEventTracker();
    const batch = tracker.observe(state(window('1', FIREFOX, { title: 'x'.repeat(1000) })), null);
    expect(batch.events[0]?.title).toHaveLength(APP_EVENT_TITLE_LONGEST);
    expect(APP_EVENT.safeParse(batch.events[0]).success).toBe(true);
  });
});
