import { randomUUID } from 'node:crypto';
import { act, createElement } from 'react';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DSH_ENGINE, SESSION, AI_MESSAGE_REFERENCE } from '@smarteverything/domain';
import type { ConnectionState } from '../../../api/connection/connection';
import { EntityStore } from '../../../store/entity-store';
import { aiDrafts } from '../data/ai-drafts';
import { captureDraftSubmission, draftSubmission, setDraft } from '../data/drafts';
import { sendNormal } from '../components/send-normal-draft';
import { usePickerSession } from '../picker/model-search-session';
import { useDraftChatStart, useDraftSender, type DraftSender } from './draft-chat-start';

const mocks = vi.hoisted(() => ({ create: vi.fn(), send: vi.fn(), clearUploads: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => randomUUID() }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(() => Promise.resolve(null)), setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock('../../../api/ai', () => ({ createAiChat: mocks.create, sendAiChatMessage: mocks.send }));
vi.mock('../../../api/connection/connection', async () => {
  const { ValueStore } = await import('../../../design/external-store');
  return { connectionState: new ValueStore<ConnectionState>({ status: 'loading' }) };
});
vi.mock('../../../api/transport', () => ({
  api: (): typeof client => client,
  useConnection: (): ConnectionState => connectionState.get(),
}));
vi.mock('../../../store/store-context', () => ({ useEntityStore: (): EntityStore => store }));
vi.mock('../../../store/selectors', () => ({
  useSession: (): typeof session => sessionOfStore(),
  useSyncStatus: (): ReturnType<EntityStore['get']>['sync'] => store.get().sync,
}));
vi.mock('../data/uploads', () => ({
  clearSubmittedUploads: mocks.clearUploads,
  moveUploads: vi.fn(),
}));

const { connectionState } = await import('../../../api/connection/connection');
const client = { baseUrl: 'http://hub.test', call: vi.fn() };
const session = SESSION.parse({
  client: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Phone',
    platform: 'android',
    role: 'owner',
    built_in: false,
    profile_id: '00000000-0000-4000-8000-000000000002',
    created_at: '2026-10-01T00:00:00.000Z',
    last_seen_at: null,
  },
  hub: { version: '1.0.0', startedAt: '2026-10-01T00:00:00.000Z', cameras: 'running' },
});
const engine = DSH_ENGINE.parse({
  kind: 'dsh',
  execution_target: { kind: 'server' },
  session_id: null,
  model: 'm',
  model_route_id: '00000000-0000-4000-8000-000000000003',
});
let store: EntityStore;
let root: Root;
const opened = vi.fn();
const capture = vi.fn<(sender: DraftSender) => void>();
function sessionOfStore(): typeof session {
  const current = store.get().session;
  if (current === null) throw new Error('Expected a signed-in session');
  return current;
}
function Sender(): null {
  capture(useDraftSender('new-chat', 'Home Hub', { resolve: () => engine, opened }));
  return null;
}
function sender(): DraftSender {
  const current = capture.mock.lastCall?.[0];
  if (current === undefined) throw new Error('Expected a mounted sender');
  return current;
}
function mount(): void {
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(Sender));
  });
}
function submit(): Promise<void> {
  return sendNormal(
    {
      disabled: false,
      placeholder: 'Message',
      draftKey: 'new-chat',
      send: sender().send,
    },
    { references: [], quote: null, setQuote: vi.fn(), setEditor: vi.fn() },
    [],
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  store = new EntityStore();
  store.update((state) => ({ ...state, session, sync: { ...state.sync, status: 'live' } }));
  connectionState.set({
    status: 'paired',
    kind: 'phone',
    connection: { url: 'http://hub.test', token: 'fake-token' },
  });
  aiDrafts.set({ drafts: {}, quotes: {}, uploads: [], outbox: [] });
  mocks.create.mockResolvedValue({ id: 'chat-1' });
  mocks.send.mockResolvedValue(null);
  mount();
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
});

const startCapture = vi.fn<(value: ReturnType<typeof useDraftChatStart>) => void>();
function ChatStart(): null {
  startCapture(useDraftChatStart('new-chat', engine, { resolve: () => engine, opened }));
  return null;
}
function showStart(): void {
  act(() => {
    root.render(
      createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ChatStart)),
    );
  });
}
function startAction(): ReturnType<typeof useDraftChatStart> {
  const current = startCapture.mock.lastCall?.[0];
  if (current === undefined) throw new Error('Expected explicit start controls');
  return current;
}

describe('explicit draft chat creation ownership', () => {
  it('creates and opens once for two same-render Start chat calls', async () => {
    notifyManager.setScheduler((callback) => {
      callback();
    });
    client.call.mockReset().mockResolvedValue({ id: 'empty-chat' });
    setDraft('new-chat', '/command');
    showStart();
    const action = startAction();
    await act(() => {
      action.start();
      action.start();
      return Promise.resolve();
    });
    expect(client.call).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledExactlyOnceWith('empty-chat');
    expect(aiDrafts.get().drafts['empty-chat']?.text).toBe('/command');
    expect(aiDrafts.get().drafts['new-chat']).toBeUndefined();
  });

  it('retains explicit start ownership and pending status through remount', async () => {
    notifyManager.setScheduler((callback) => {
      callback();
    });
    let created = (_chat: { id: string }): void => {
      throw new Error('Expected pending creation');
    };
    client.call.mockReset().mockImplementation(
      () =>
        new Promise<{ id: string }>((resolve) => {
          created = resolve;
        }),
    );
    setDraft('new-chat', '/command');
    showStart();
    await act(() => {
      startAction().start();
      return Promise.resolve();
    });
    act(() => {
      root.render(null);
    });
    showStart();
    expect(startAction().pending).toBe(true);
    await act(() => {
      startAction().start();
      return Promise.resolve();
    });
    expect(client.call).toHaveBeenCalledTimes(1);
    await act(() => {
      created({ id: 'empty-chat' });
      return Promise.resolve();
    });
    expect(opened).toHaveBeenCalledExactlyOnceWith('empty-chat');
    expect(aiDrafts.get().drafts['empty-chat']?.text).toBe('/command');
    expect(startAction().pending).toBe(false);
  });
});

describe('first-message acceptance and navigation', () => {
  it('opens one chat and consumes its first draft when own client metadata changes during send', async () => {
    setDraft('new-chat', 'First request');
    mocks.send.mockImplementationOnce(() => {
      store.update((state) => ({
        ...state,
        session: {
          ...session,
          client: { ...session.client, last_seen_at: '2026-11-07T23:18:17.325Z' },
        },
      }));
      return Promise.resolve(null);
    });
    await act(submit);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledExactlyOnceWith('chat-1');
    expect(aiDrafts.get().drafts['new-chat']?.text).toBe('');
    expect(aiDrafts.get().drafts['new-chat']?.submission).toBeUndefined();
  });

  it('does not restore an acknowledged message when sync becomes interrupted before navigation', async () => {
    setDraft('new-chat', 'First request');
    mocks.send.mockImplementationOnce(() => {
      store.update((state) => ({ ...state, sync: { ...state.sync, status: 'interrupted' } }));
      return Promise.resolve(null);
    });
    await act(submit);
    expect(opened).not.toHaveBeenCalled();
    expect(aiDrafts.get().drafts['new-chat']?.text).toBe('');
  });

  it('keeps accepted delivery consumed when opening the chat throws', async () => {
    setDraft('new-chat', 'First request');
    opened.mockImplementationOnce(() => {
      throw new Error('navigation failed');
    });
    await act(submit);
    expect(aiDrafts.get().drafts['new-chat']?.text).toBe('');
    expect(aiDrafts.get().drafts['new-chat']?.submission).toBeUndefined();
  });

  it('restores uncertain delivery and retries only its original chat and request ID after remount', async () => {
    setDraft('new-chat', 'First request');
    const original = captureDraftSubmission('new-chat', {
      text: 'First request',
      attachments: [],
      references: [],
    });
    mocks.send.mockRejectedValueOnce(new Error('acknowledgement lost'));
    await act(submit);
    expect(aiDrafts.get().drafts['new-chat']?.text).toBe('First request');
    expect(draftSubmission('new-chat', original.id)?.chat?.id).toBe('chat-1');
    expect(sender().failure).toContain('Your message is still here.');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    act(() => {
      root.unmount();
    });
    mount();
    await act(submit);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenNthCalledWith(2, 'chat-1', 'First request', [], {
      clientMessageId: original.id,
      references: [],
    });
    expect(opened).toHaveBeenCalledExactlyOnceWith('chat-1');
  });

  it('preserves references and quotes and only clears files belonging to the accepted submission', async () => {
    const reference = AI_MESSAGE_REFERENCE.parse({
      reference: { kind: 'plugin', asset_id: 'plugin', revision: 'r' },
      label: 'Plugin',
      token: '@Plugin',
      start: 2,
      end: 9,
    });
    const upload = {
      key: 'submitted-file',
      draftKey: 'new-chat',
      name: 'plan.txt',
      mime: 'text/plain',
      preview: null,
      progress: 1,
      state: 'done' as const,
      failure: null,
      attachment: {
        id: 'attachment',
        name: 'plan.txt',
        mime: 'text/plain',
        bytes: 4,
        width: null,
        height: null,
      },
    };
    aiDrafts.update((state) => ({ ...state, uploads: [upload] }));
    mocks.send.mockImplementationOnce(() => {
      aiDrafts.update((state) => ({
        ...state,
        uploads: [
          ...state.uploads,
          {
            ...upload,
            key: 'later-file',
            attachment: { ...upload.attachment, id: 'later-attachment' },
          },
        ],
      }));
      return Promise.resolve(null);
    });
    await act(async () => {
      expect(
        await sender().send('  @Plugin question  ', ['attachment'], {
          clientMessageId: 'request-with-files',
          references: [reference],
          quoteMessageId: 'quote',
        }),
      ).toBe(true);
    });
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith(
      'chat-1',
      '@Plugin question',
      ['attachment'],
      {
        clientMessageId: 'request-with-files',
        references: [{ ...reference, start: 0, end: 7 }],
        quoteMessageId: 'quote',
      },
    );
    expect(mocks.clearUploads).toHaveBeenCalledExactlyOnceWith(['submitted-file']);
  });

  it('keeps edits made while an uncertain first message is pending', async () => {
    setDraft('new-chat', 'First request');
    mocks.send.mockImplementationOnce(() => {
      setDraft('new-chat', 'Next request');
      return Promise.reject(new Error('acknowledgement lost'));
    });
    await act(submit);
    expect(aiDrafts.get().drafts['new-chat']?.text).toBe('Next request');
    expect(aiDrafts.get().drafts['new-chat']?.submission).toBeUndefined();
  });

  it('invalidates captured picker authority on a real profile change', () => {
    const captured = vi.fn<(value: ReturnType<typeof usePickerSession>) => void>();
    function Scope(): null {
      captured(usePickerSession());
      return null;
    }
    act(() => {
      root.render(createElement(Scope));
    });
    const valid = captured.mock.lastCall?.[0].valid;
    if (valid === undefined) throw new Error('Expected captured picker authority');
    expect(valid()).toBe(true);
    store.update((state) => ({
      ...state,
      session: {
        ...session,
        client: { ...session.client, profile_id: '00000000-0000-4000-8000-000000000004' },
      },
    }));
    expect(valid()).toBe(false);
  });
});
