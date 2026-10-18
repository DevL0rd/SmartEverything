import { describe, expect, it, vi } from 'vitest';
import { OVERLAY_HIDDEN, type OverlayView } from '@smarteverything/domain';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const { announceOverlay, noticeOf } = await import('./overlay-announce');
import type { AnnouncePorts } from './overlay-announce';

const view = (change: Partial<OverlayView>): OverlayView => ({ ...OVERLAY_HIDDEN, ...change });

function ports(
  hidden: boolean,
  shortcut: string | null = null,
): {
  readonly said: string[];
  readonly notices: string[];
  readonly set: AnnouncePorts;
} {
  const said: string[] = [];
  const notices: string[] = [];
  return {
    said,
    notices,
    set: {
      say: (text: string): void => {
        said.push(text);
      },
      notify: (notice: { title: string }): void => {
        notices.push(notice.title);
      },
      windowHidden: (): boolean => hidden,
      shortcut: (): string | null => shortcut,
    },
  };
}

const WAKE = view({ state: 'wake', status: 'Listening' });
const ERROR = view({ state: 'error', status: 'Can’t reach your home', caption: 'Try again.' });

describe('overlay announcements', () => {
  it('says the wake state once, not on every change inside it', () => {
    const { said, set } = ports(false);
    announceOverlay(null, WAKE, set);
    announceOverlay(WAKE, { ...WAKE, caption: 'turn on' }, set);
    expect(said).toEqual(['Listening']);
  });

  it('stays quiet through listening, thinking and speaking', () => {
    const { said, set } = ports(false);
    announceOverlay(WAKE, view({ state: 'listening', status: 'Listening' }), set);
    announceOverlay(null, view({ state: 'speaking', status: 'Speaking' }), set);
    expect(said).toEqual([]);
  });

  it('says an error with its caption, a takeover and the end of the call', () => {
    const { said, set } = ports(false);
    announceOverlay(WAKE, ERROR, set);
    announceOverlay(null, view({ state: 'superseded', status: 'Answered by Kitchen' }), set);
    announceOverlay(null, view({ state: 'ended', status: 'Call ended' }), set);
    expect(said).toEqual([
      'Can’t reach your home. Try again.',
      'Answered by Kitchen',
      'Call ended',
    ]);
  });

  it('says a new request once with its reason', () => {
    const { said, set } = ports(false);
    const request = {
      title: 'Ada wants to see your screen',
      why: 'To help',
      accept: 'Share',
      expiresAt: null,
    };
    const asking = view({ state: 'listening', request });
    announceOverlay(null, asking, set);
    announceOverlay(asking, { ...asking, status: 'Thinking' }, set);
    expect(said).toEqual(['Ada wants to see your screen. To help']);
  });

  it('tells where the keyboard answer is when a shortcut is bound', () => {
    const { said, set } = ports(false, 'Ctrl+Alt+A');
    const request = {
      title: 'Ada wants to see your screen',
      why: 'To help',
      accept: 'Share',
      expiresAt: null,
    };
    announceOverlay(null, view({ state: 'listening', request }), set);
    expect(said).toEqual(['Ada wants to see your screen. To help. Press Ctrl+Alt+A to answer']);
  });

  it('notifies about a new request only while the main window is hidden, once', () => {
    const request = {
      title: 'Ada wants to see your screen',
      why: '',
      accept: 'Share',
      expiresAt: null,
    };
    const asking = view({ state: 'listening', request });
    const bodies: string[] = [];
    const hidden = {
      ...ports(true, 'Ctrl+Alt+A').set,
      notify: (notice: { body: string }): void => {
        bodies.push(notice.body);
      },
    };
    announceOverlay(null, asking, hidden);
    announceOverlay(asking, { ...asking, status: 'Thinking' }, hidden);
    expect(bodies).toEqual(['Press Ctrl+Alt+A to answer']);
    const shown = ports(false, 'Ctrl+Alt+A');
    announceOverlay(null, asking, shown.set);
    expect(shown.notices).toEqual([]);
  });

  it('notifies about an error only while the main window is hidden', () => {
    const hidden = ports(true);
    announceOverlay(WAKE, ERROR, hidden.set);
    announceOverlay(ERROR, ERROR, hidden.set);
    expect(hidden.notices).toEqual(['Can’t reach your home']);
    const shown = ports(false);
    announceOverlay(WAKE, ERROR, shown.set);
    expect(shown.notices).toEqual([]);
    expect(noticeOf(null, WAKE)).toBeNull();
  });
});
