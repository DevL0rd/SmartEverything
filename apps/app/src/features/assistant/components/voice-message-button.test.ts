import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessions = vi.hoisted((): string[] => []);
const notify = vi.hoisted(() => vi.fn());

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('react-native-gesture-handler', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  GestureDetector: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/menu', () => ({ useAnchoredMenu: vi.fn() }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/tooltip', () => ({ Tooltip: (): null => null }));
vi.mock('../../../components/toast-store', () => ({
  notify,
  notifyFailure:
    (message: string) =>
    (error: unknown): void => {
      notify({ message, error, tone: 'critical' });
    },
}));
vi.mock('../../../design/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useIdiom: (): string => 'touch',
  idiomNow: (): string => 'touch',
}));
vi.mock('../../../platform/pick-files', () => ({ pickFiles: vi.fn() }));
vi.mock('../data/uploads', () => ({ attachFiles: vi.fn() }));
vi.mock('./composer-chip', () => ({ ComposerChip: (): null => null }));
vi.mock('../voice-message/recorder-session', () => ({
  VoiceSession: ({ mode }: { readonly mode: string }): null => {
    sessions.push(mode);
    return null;
  },
}));

const { VoiceMessageButton } = await import('./composer-extras');
const { requestVoiceMessage, showChatOnScreen } = await import('../voice-message/voice-request');

let root: Root;
let hide: () => void;

function mount(draftKey: string, disabled: boolean): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(VoiceMessageButton, { draftKey, disabled, onSend: vi.fn() }));
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  sessions.length = 0;
  notify.mockClear();
  hide = showChatOnScreen('chat-a');
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  hide();
  vi.unstubAllGlobals();
});

describe('the voice message button', () => {
  it('starts recording at once when the power button asks for its chat', () => {
    mount('chat-a', false);
    expect(sessions).toEqual([]);
    act(() => {
      requestVoiceMessage('chat-a');
    });
    expect(sessions.at(-1)).toBe('sheet');
  });

  it('picks up a request made before the chat opened', () => {
    act(() => {
      requestVoiceMessage('chat-a');
    });
    mount('chat-a', false);
    expect(sessions.at(-1)).toBe('sheet');
  });

  it('leaves requests for other chats alone', () => {
    mount('chat-a', false);
    act(() => {
      requestVoiceMessage('chat-b');
    });
    expect(sessions).toEqual([]);
  });

  it('says so instead of recording in a chat that cannot take messages', () => {
    mount('chat-a', true);
    act(() => {
      requestVoiceMessage('chat-a');
    });
    expect(sessions).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
  });
});
