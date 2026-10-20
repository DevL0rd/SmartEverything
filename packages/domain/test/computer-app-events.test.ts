import { describe, expect, it } from 'vitest';
import {
  APP_EVENT_DEVICE_KINDS,
  APP_EVENT_KINDS,
  APP_EVENT_STATES,
  APP_EVENTS_FRAME,
  COMPUTER_SCOPES,
  DEFAULT_COMPUTER_SCOPES,
  EVENT_KINDS,
  EVENT_KIND_LABELS,
  NODE_FRAME,
  SIGNAL_SOURCES,
  appEventSummary,
  eventKeywords,
  kindSpecOf,
  signalRegistered,
} from '../src';
import { EVENT_MATCH } from '../src/signal-sources/event-match';

const FRAME = {
  type: 'app_events',
  at: '2026-10-08T10:00:00.000Z',
  baseline: false,
  events: [{ kind: 'opened', app: { id: 'firefox.desktop', name: 'Firefox' }, title: 'Home' }],
};

describe('computer app events', () => {
  it('travel from the node as a frame with at least one event', () => {
    expect(NODE_FRAME.parse(FRAME)).toEqual(FRAME);
    expect(APP_EVENTS_FRAME.safeParse({ ...FRAME, events: [] }).success).toBe(false);
    expect(APP_EVENTS_FRAME.safeParse({ ...FRAME, baseline: undefined }).success).toBe(false);
  });

  it('refuse an unknown kind, an unnamed app or an unexpected field', () => {
    expect(
      APP_EVENTS_FRAME.safeParse({ ...FRAME, events: [{ ...FRAME.events[0], kind: 'moved' }] })
        .success,
    ).toBe(false);
    expect(
      APP_EVENTS_FRAME.safeParse({
        ...FRAME,
        events: [{ ...FRAME.events[0], app: { id: 'x', name: '' } }],
      }).success,
    ).toBe(false);
    expect(
      APP_EVENTS_FRAME.safeParse({ ...FRAME, events: [{ ...FRAME.events[0], extra: 1 }] }).success,
    ).toBe(false);
  });

  it('give every kind a registered event with a label, match keys and a state signal', () => {
    for (const kind of APP_EVENT_KINDS) {
      const eventKind = APP_EVENT_DEVICE_KINDS[kind];
      expect(EVENT_KINDS).toContain(eventKind);
      expect(EVENT_KIND_LABELS[eventKind]).not.toBe('');
      expect(EVENT_MATCH[eventKind].map((entry) => entry.key)).toContain('app');
      const state = APP_EVENT_STATES[kind];
      expect(
        signalRegistered(SIGNAL_SOURCES, {
          source: 'computer',
          kind: state.kind,
          field: 'firefox.desktop',
        }),
      ).toBe(true);
    }
  });

  it('pair opened with closed and focused with unfocused as the on and off of one signal', () => {
    expect(APP_EVENT_STATES.opened).toEqual({ kind: 'app_open', value: true });
    expect(APP_EVENT_STATES.closed).toEqual({ kind: 'app_open', value: false });
    expect(APP_EVENT_STATES.focused).toEqual({ kind: 'app_focus', value: true });
    expect(APP_EVENT_STATES.unfocused).toEqual({ kind: 'app_focus', value: false });
  });

  it('say what happened to the app in plain words', () => {
    expect(appEventSummary('opened', 'Firefox')).toBe('Firefox opened');
    expect(appEventSummary('closed', 'Firefox')).toBe('Firefox closed');
    expect(appEventSummary('focused', 'Firefox')).toBe('Firefox came to the front');
    expect(appEventSummary('unfocused', 'Firefox')).toBe('Firefox left the front');
  });

  it('need an app id as the field of the state signals and never accept none', () => {
    const base = { source: 'computer', kind: 'app_open' };
    expect(signalRegistered(SIGNAL_SOURCES, { ...base, field: null })).toBe(false);
    expect(signalRegistered(SIGNAL_SOURCES, { ...base, field: 'org.kde.kate' })).toBe(true);
    expect(kindSpecOf(SIGNAL_SOURCES, base)?.states).toEqual({ on: 'open', off: 'closed' });
  });

  it('are controlled by one owner setting that is on by default', () => {
    expect(DEFAULT_COMPUTER_SCOPES.app_events).toBe(true);
    expect(COMPUTER_SCOPES.shape.app_events.description).toContain('apps');
  });

  it('can be found by the words people use for apps and windows', () => {
    expect(eventKeywords('app_opened', {})).toContain('program');
    expect(eventKeywords('app_closed', {})).toContain('quit');
    expect(eventKeywords('app_focused', {})).toContain('front');
    expect(eventKeywords('app_unfocused', {})).toContain('inactive');
    expect(eventKeywords('doorbell', {})).toEqual([]);
  });
});
