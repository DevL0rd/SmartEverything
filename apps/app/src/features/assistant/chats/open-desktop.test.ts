import { describe, expect, it, vi } from 'vitest';
import { CLAUDE_LISTED_SESSION } from '@smarteverything/domain';
import { APP_SOURCE } from '../model/chat-source';
import type { ChatEntry } from './chat-entry';
import { linkedChatOf, openDesktopEntry, type DesktopOpenDeps } from './open-desktop';

const SESSION = CLAUDE_LISTED_SESSION.parse({
  app_chat_id: null,
  id: '5f0e1c52-1a0e-4b0d-8f0b-7f2b1f6d4e91',
  desktop_id: null,
  title: 'Fix it',
  cwd: '/work/app',
  state: 'idle',
  last_state: null,
  archived: false,
  model: null,
  permission_mode: 'unknown',
  entrypoint: null,
  pid: null,
  started_at: null,
  updated_at: null,
  waiting_prompts: 0,
  context_used: null,
  capabilities: {
    send: null,
    interrupt: null,
    answer_prompts: null,
    set_mode: null,
    set_model: null,
    usage: null,
  },
});

function entry(): ChatEntry {
  return {
    id: 'desktop:pc:desktop-1',
    kind: 'chat',
    title: 'Fix it',
    source: APP_SOURCE,
    at: '2026-10-17T09:00:00.000Z',
    pinned: false,
    archived: false,
    unread: 0,
    requests: 0,
    parentId: null,
    runtime: 'claude',
    computerId: 'pc',
    line: { kind: 'preview', speaker: null, text: 'app' },
    desktop: { deviceId: 'pc', deviceName: 'Desk', session: SESSION },
  };
}

function rig(change: Partial<DesktopOpenDeps> = {}): DesktopOpenDeps {
  return {
    linkedChat: () => undefined,
    confirm: vi.fn(() => Promise.resolve(true)),
    fork: vi.fn(() => Promise.resolve('app-chat')),
    open: vi.fn(),
    notify: vi.fn(),
    busy: vi.fn(),
    ...change,
  };
}

describe('opening a Desktop Claude session from the chat list', () => {
  it('asks once, forks, then opens the new app chat', async () => {
    const deps = rig();
    await openDesktopEntry(deps, entry());
    expect(deps.confirm).toHaveBeenCalledTimes(1);
    expect(deps.fork).toHaveBeenCalledWith(entry().desktop);
    expect(deps.open).toHaveBeenCalledWith('app-chat');
    expect(deps.busy).toHaveBeenNthCalledWith(1, entry().id);
    expect(deps.busy).toHaveBeenLastCalledWith(null);
  });

  it('opens the linked app chat at once, without asking or forking again', async () => {
    const deps = rig({ linkedChat: () => 'linked-chat' });
    await openDesktopEntry(deps, entry());
    expect(deps.open).toHaveBeenCalledWith('linked-chat');
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.fork).not.toHaveBeenCalled();
  });

  it('does nothing when the confirmation is declined', async () => {
    const deps = rig({ confirm: vi.fn(() => Promise.resolve(false)) });
    await openDesktopEntry(deps, entry());
    expect(deps.fork).not.toHaveBeenCalled();
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.busy).toHaveBeenLastCalledWith(null);
  });

  it('marks the row busy while the confirmation is open so a second press cannot start another', async () => {
    let busyWhileAsking: unknown = 'unset';
    const busy = vi.fn();
    const deps = rig({
      busy,
      confirm: vi.fn(() => {
        busyWhileAsking = busy.mock.calls.at(-1)?.[0];
        return Promise.resolve(false);
      }),
    });
    await openDesktopEntry(deps, entry());
    expect(busyWhileAsking).toBe(entry().id);
  });

  it('shows the reason with a retry that forks again and opens the chat', async () => {
    const fork = vi
      .fn<DesktopOpenDeps['fork']>()
      .mockRejectedValueOnce(new Error('The home hub needs its pending update.'))
      .mockResolvedValueOnce('app-chat');
    const deps = rig({ fork });
    await openDesktopEntry(deps, entry());
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.busy).toHaveBeenLastCalledWith(null);
    const toast = vi.mocked(deps.notify).mock.calls[0]?.[0];
    expect(toast).toMatchObject({
      tone: 'critical',
      detail: 'The home hub needs its pending update.',
      action: { label: 'Retry' },
    });
    toast?.action?.onPress();
    await vi.waitFor(() => {
      expect(deps.open).toHaveBeenCalledWith('app-chat');
    });
    expect(deps.confirm).toHaveBeenCalledTimes(1);
  });
});

describe('finding the app chat that continues a Desktop session', () => {
  const desktop = entry().desktop;
  const live = {
    id: 'live-chat',
    engine: { kind: 'claude', device_id: 'pc', continued_from: SESSION.id },
  };

  it('prefers a live chat, then the chat the hub names, which may be archived', () => {
    if (desktop === undefined) throw new Error('entry has no desktop');
    const named = { ...desktop, session: { ...desktop.session, app_chat_id: 'archived-chat' } };
    expect(linkedChatOf([live], named)).toBe('live-chat');
    expect(linkedChatOf([], named)).toBe('archived-chat');
    expect(linkedChatOf([], desktop)).toBeUndefined();
  });

  it('ignores chats of another computer or another session', () => {
    if (desktop === undefined) throw new Error('entry has no desktop');
    const elsewhere = { ...live, engine: { ...live.engine, device_id: 'other' } };
    const another = { ...live, engine: { ...live.engine, continued_from: 'other-session' } };
    expect(linkedChatOf([elsewhere, another], desktop)).toBeUndefined();
  });
});
