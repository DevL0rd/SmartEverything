import type { DesktopTalkShortcuts } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));

const { desktopTalkStatusOf } = await import('./use-talk-shortcuts');

const SHORTCUTS: DesktopTalkShortcuts = {
  backend: 'portal',
  hold: true,
  talk: 'Ctrl+T',
  next: null,
  assistant: null,
  assistantMute: null,
  problem: null,
};
const BRIDGE = { talkShortcuts: (): Promise<DesktopTalkShortcuts> => Promise.resolve(SHORTCUTS) };

describe('desktopTalkStatusOf', () => {
  it('is nothing outside the desktop app', () => {
    expect(desktopTalkStatusOf(null, undefined, null)).toEqual({ status: 'none' });
  });

  it('says the desktop app is outdated when it cannot read shortcuts', () => {
    expect(desktopTalkStatusOf({}, undefined, null)).toEqual({ status: 'outdated' });
  });

  it('shows the shortcuts once read, and keeps them if a later read fails', () => {
    expect(desktopTalkStatusOf(BRIDGE, SHORTCUTS, new Error('later'))).toEqual({
      status: 'ready',
      shortcuts: SHORTCUTS,
    });
  });

  it('is loading, then failed, while nothing has been read', () => {
    expect(desktopTalkStatusOf(BRIDGE, undefined, null)).toEqual({ status: 'loading' });
    expect(desktopTalkStatusOf(BRIDGE, undefined, new Error('no portal'))).toEqual({
      status: 'failed',
      reason: 'no portal',
    });
  });
});
