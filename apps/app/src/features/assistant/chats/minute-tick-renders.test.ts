import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_SOURCE } from '../model/chat-source';
import { chatListTime } from '../model/chat-list-time';
import type { ChatEntry } from './chat-entry';

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (): { remove: () => void } => ({ remove: (): void => undefined }),
  },
}));

const { startClock, useDayNow, useMinute, useMinuteOf } = await import('../../../store/clock');
const { sectionKeyOf, useSectionNow } = await import('./section-now');

const ZONE = 'UTC';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const START = Date.parse('2026-10-16T22:00:10.000Z');

function entry(id: string, at: number): ChatEntry {
  return {
    id,
    kind: 'chat',
    title: id,
    source: APP_SOURCE,
    at: new Date(at).toISOString(),
    pinned: false,
    archived: false,
    unread: 0,
    requests: 0,
    parentId: null,
    runtime: null,
    computerId: null,
    line: { kind: 'empty' },
  };
}

const renders = vi.hoisted(() => ({ minute: 0, label: 0, day: 0, section: 0 }));
const shown = vi.hoisted(() => ({ minute: '', label: '', day: 0, section: '' }));

type Probe = keyof typeof renders;

function note<K extends Probe>(probe: K, value: (typeof shown)[K]): null {
  renders[probe] += 1;
  shown[probe] = value;
  return null;
}

function MinuteProbe({ at }: { readonly at: string }): ReactNode {
  return note('minute', chatListTime(at, useMinute(), ZONE));
}

function LabelProbe({ at }: { readonly at: string }): ReactNode {
  return note(
    'label',
    useMinuteOf((now) => chatListTime(at, now, ZONE)),
  );
}

function DayProbe(): ReactNode {
  return note('day', useDayNow(ZONE));
}

function SectionProbe({ pool }: { readonly pool: readonly ChatEntry[] }): ReactNode {
  return note('section', sectionKeyOf(pool, useSectionNow(pool, ZONE), ZONE));
}

let root: Root;
let stop: () => void;

function mount(children: ReactNode): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(children);
  });
}

function advance(ms: number): void {
  for (let passed = 0; passed < ms; passed += MINUTE) {
    act(() => {
      vi.advanceTimersByTime(MINUTE);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  stop = startClock();
  renders.minute = 0;
  renders.label = 0;
  renders.day = 0;
  renders.section = 0;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('minute tick renders of day-granular chat rows', () => {
  it('re-renders a chat row time only when its label changes, while useMinute renders every minute', () => {
    const at = new Date(START - 3 * DAY).toISOString();
    mount([
      createElement(MinuteProbe, { key: 'm', at }),
      createElement(LabelProbe, { key: 'l', at }),
      createElement(DayProbe, { key: 'd' }),
    ]);
    const mounted = { ...renders };
    advance(60 * MINUTE);
    expect(renders.minute - mounted.minute).toBe(60);
    expect(renders.label - mounted.label).toBe(0);
    expect(renders.day - mounted.day).toBe(0);
    advance(60 * MINUTE);
    expect(renders.label - mounted.label).toBe(0);
    expect(renders.day - mounted.day).toBe(1);
  });

  it('re-renders a today row when it crosses midnight into a weekday label', () => {
    const at = START - 5 * MINUTE;
    mount(createElement(LabelProbe, { at: new Date(at).toISOString() }));
    const mounted = renders.label;
    const before = shown.label;
    advance(121 * MINUTE);
    expect(renders.label - mounted).toBe(1);
    expect(shown.label).not.toBe(before);
  });

  it('re-renders the sections only on the day change and when a chat leaves the previous week', () => {
    const pool = [entry('today', START - MINUTE), entry('leaving', START - 7 * DAY + 30 * MINUTE)];
    mount(createElement(SectionProbe, { pool }));
    const mounted = renders.section;
    advance(29 * MINUTE);
    expect(renders.section - mounted).toBe(0);
    advance(2 * MINUTE);
    expect(renders.section - mounted).toBe(1);
    advance(60 * MINUTE);
    expect(renders.section - mounted).toBe(1);
    advance(60 * MINUTE);
    expect(renders.section - mounted).toBe(2);
  });
});
