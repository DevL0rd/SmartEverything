import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_CHAT_ROW } from '@smarteverything/domain';
import { ScreenPause, ScreenPausedContext } from '../../../design/screen-pause';
import { EntityStore } from '../../../store/entity-store';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  open: vi.fn(),
  failed: vi.fn(),
  focused: true,
  listeners: new Set<{ readonly focus: () => void; readonly blur: () => void }>(),
}));

vi.mock('expo-router', () => ({
  router: { replace: mocks.replace },
  useFocusEffect: (effect: () => undefined | (() => void)): void => {
    useEffect(() => {
      let cleanup: undefined | (() => void);
      const listener = {
        focus: (): void => {
          cleanup = effect();
        },
        blur: (): void => {
          cleanup?.();
          cleanup = undefined;
        },
      };
      mocks.listeners.add(listener);
      if (mocks.focused) listener.focus();
      return (): void => {
        listener.blur();
        mocks.listeners.delete(listener);
      };
    }, [effect]);
  },
}));
vi.mock('react-native', () => ({
  View: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../api/ai', () => ({ openConversationChat: mocks.open }));
vi.mock('../../../app-shell/close-flow', () => ({ closeFlow: vi.fn() }));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../../components/error-state', () => ({
  ErrorState: ({ error }: { readonly error: unknown }): null => {
    mocks.failed(error);
    return null;
  },
}));
vi.mock('../../../components/list-loader', () => ({ ListLoader: (): null => null }));
vi.mock('../../../components/screen', () => ({
  Screen: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../store/store-context', () => ({ useEntityStore: (): EntityStore => store }));
vi.mock('../../../store/assistant-response-style', () => ({
  captureAssistantWrite: vi.fn(),
  assertAssistantWriteCurrent: vi.fn(),
}));

const { VoiceMessageOpening } = await import('./voice-message-opening');
const { claimVoiceMessage, showChatOnScreen } = await import('./voice-request');
const CHAT = AI_CHAT_ROW.parse({
  id: '0e000000-0000-4000-8000-0000000000c1',
  profile_id: '0e000000-0000-4000-8000-000000000001',
  kind: 'chat',
  title: 'Assistant',
  icon: null,
  parent_id: null,
  source_key: 'conversation',
  engine: {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model: 'fixture',
    model_route_id: '0e000000-0000-4000-8000-000000000002',
  },
  tools: null,
  pinned: false,
  memory: false,
  archived_at: null,
  cost_micros: 0,
  last_message_at: null,
  created_at: '2026-11-08T00:00:00Z',
  updated_at: '2026-11-08T00:00:00Z',
});

interface PendingChat {
  readonly promise: Promise<typeof CHAT>;
  readonly resolve: () => void;
  readonly reject: () => void;
}

function pendingChat(): PendingChat {
  let resolve: () => void = () => undefined;
  let reject: () => void = () => undefined;
  const promise = new Promise<typeof CHAT>((done, fail) => {
    resolve = (): void => {
      done(CHAT);
    };
    reject = (): void => {
      fail(new Error('Offline'));
    };
  });
  return { promise, resolve, reject };
}

let store: EntityStore;
let root: Root;

function mount(pause = new ScreenPause(null)): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(
      createElement(ScreenPausedContext, { value: pause }, createElement(VoiceMessageOpening)),
    );
  });
}

function focused(value: boolean): void {
  act(() => {
    mocks.focused = value;
    for (const listener of [...mocks.listeners]) {
      if (value) listener.focus();
      else listener.blur();
    }
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  mocks.focused = true;
  mocks.listeners.clear();
  mocks.replace.mockReset();
  mocks.open.mockReset();
  mocks.failed.mockReset();
  store = new EntityStore();
  const hide = showChatOnScreen(CHAT.id);
  hide();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

describe('a mounted voice opening route', () => {
  it('ignores a response after blur and publishes the fresh refocus response before routing', async () => {
    const old = pendingChat();
    const fresh = pendingChat();
    mocks.open.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    mount();
    focused(false);
    focused(true);
    await act(async () => {
      old.resolve();
      await old.promise;
    });
    expect(store.get().tables.ai_chats.rows).toEqual([]);
    expect(claimVoiceMessage(CHAT.id)).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.replace.mockImplementation(() => {
      expect(store.get().tables.ai_chats.byId[CHAT.id]).toEqual(CHAT);
    });
    await act(async () => {
      fresh.resolve();
      await fresh.promise;
    });
    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(claimVoiceMessage(CHAT.id)).toBe(true);
  });

  it('ignores blurred errors and displays a fresh request failure after refocus', async () => {
    const old = pendingChat();
    const fresh = pendingChat();
    mocks.open.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    mount();
    focused(false);
    await act(async () => {
      old.reject();
      await old.promise.catch(() => undefined);
    });
    expect(mocks.failed).not.toHaveBeenCalled();
    focused(true);
    await act(async () => {
      fresh.reject();
      await fresh.promise.catch(() => undefined);
    });
    expect(mocks.failed).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'Offline' }));
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(claimVoiceMessage(CHAT.id)).toBe(false);
  });

  it('invalidates an in-flight opener as soon as its screen is paused', async () => {
    const old = pendingChat();
    mocks.open.mockReturnValueOnce(old.promise);
    const pause = new ScreenPause(null);
    mount(pause);
    await act(async () => {
      pause.setOwn(true);
      old.resolve();
      await old.promise;
    });
    expect(store.get().tables.ai_chats.rows).toEqual([]);
    expect(claimVoiceMessage(CHAT.id)).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
