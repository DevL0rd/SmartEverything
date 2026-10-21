import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as StoreModule from './ai-drafts';
import type * as OutboxModule from './outbox';

const mocks = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  send: vi.fn(),
  notify: vi.fn<(input: { readonly undo?: () => void }) => void>(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string): Promise<string | null> => Promise.resolve(mocks.disk.get(key) ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      mocks.disk.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string): Promise<void> => {
      mocks.disk.delete(key);
      return Promise.resolve();
    },
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => globalThis.crypto.randomUUID() }));
vi.mock('../../../components/toast-store', () => ({ notify: mocks.notify }));
vi.mock('../../../api/ai', () => ({ sendAiChatMessage: mocks.send }));
vi.mock('../../../api/assistant', () => ({}));

const PROFILE = '00000000-0000-4000-8000-00000000000a';
const CHAT_ONE = 'chat-one';
const CHAT_TWO = 'chat-two';

async function boot(): Promise<{
  readonly store: typeof StoreModule;
  readonly outbox: typeof OutboxModule;
}> {
  vi.resetModules();
  const store = await import('./ai-drafts');
  const outbox = await import('./outbox');
  return { store, outbox };
}

async function queued(
  outbox: typeof OutboxModule,
  chat: string,
  text: string,
  id: string,
): Promise<void> {
  await outbox.outboxSender(chat, false)(text, [], [], id);
}

beforeAll(async () => {
  await boot();
}, 30_000);

beforeEach(() => {
  mocks.disk.clear();
  mocks.send.mockReset();
  mocks.notify.mockReset();
  mocks.send.mockResolvedValue({});
});

function sentTexts(): readonly string[] {
  return mocks.send.mock.calls.map((call: readonly unknown[]) => String(call[1]));
}

describe('outbox flush', () => {
  it('sends queued messages in creation order and empties the outbox', async () => {
    const { store, outbox } = await boot();
    await store.bindAiDraftsProfile(PROFILE);
    await queued(outbox, CHAT_ONE, 'first', 'id-1');
    await queued(outbox, CHAT_ONE, 'second', 'id-2');
    await queued(outbox, CHAT_TWO, 'third', 'id-3');
    await outbox.flushOutbox();
    expect(sentTexts()).toEqual(['first', 'second', 'third']);
    expect(mocks.send.mock.calls.map((call: readonly unknown[]) => call[3])).toEqual([
      expect.objectContaining({ clientMessageId: 'id-1' }),
      expect.objectContaining({ clientMessageId: 'id-2' }),
      expect.objectContaining({ clientMessageId: 'id-3' }),
    ]);
    expect(store.aiDrafts.get().outbox).toEqual([]);
  });

  it('delivers each message once when flushes overlap or a message is queued twice', async () => {
    const { store, outbox } = await boot();
    await store.bindAiDraftsProfile(PROFILE);
    await queued(outbox, CHAT_ONE, 'only', 'id-1');
    await queued(outbox, CHAT_ONE, 'only', 'id-1');
    await Promise.all([outbox.flushOutbox(), outbox.flushOutbox()]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed message waiting, holds later messages of that chat only and retries every 2 seconds until it is sent', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { store, outbox } = await boot();
    await store.bindAiDraftsProfile(PROFILE);
    mocks.send.mockImplementationOnce(() => Promise.reject(new Error('hub said no')));
    await queued(outbox, CHAT_ONE, 'first', 'id-1');
    await queued(outbox, CHAT_ONE, 'second', 'id-2');
    await queued(outbox, CHAT_TWO, 'other chat', 'id-3');
    await outbox.flushOutbox();
    expect(sentTexts()).toEqual(['first', 'other chat']);
    expect(store.aiDrafts.get().outbox.map((m) => m.id)).toEqual(['id-1', 'id-2']);
    expect(mocks.notify).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(outbox.OUTBOX_RETRY_MS - 1);
    expect(sentTexts()).toEqual(['first', 'other chat']);
    await vi.advanceTimersByTimeAsync(1);
    expect(sentTexts()).toEqual(['first', 'other chat', 'first', 'second']);
    expect(store.aiDrafts.get().outbox).toEqual([]);
    vi.useRealTimers();
  });

  it('queues an online send that fails and keeps retrying until it is cancelled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { store, outbox } = await boot();
    await store.bindAiDraftsProfile(PROFILE);
    mocks.send.mockRejectedValue(new Error('offline'));
    expect(await outbox.outboxSender(CHAT_ONE, true)('hello', [], [], 'id-1')).toBe(true);
    expect(store.aiDrafts.get().outbox.map((m) => m.id)).toEqual(['id-1']);
    await vi.advanceTimersByTimeAsync(outbox.OUTBOX_RETRY_MS * 3);
    expect(mocks.send.mock.calls.length).toBeGreaterThanOrEqual(4);
    outbox.cancelPending('id-1');
    const calls = mocks.send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(outbox.OUTBOX_RETRY_MS * 5);
    expect(mocks.send.mock.calls.length).toBe(calls);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('resends after a restart with the same client message id', async () => {
    const first = await boot();
    await first.store.bindAiDraftsProfile(PROFILE);
    await queued(first.outbox, CHAT_ONE, 'unsent', 'id-9');

    const second = await boot();
    await second.store.bindAiDraftsProfile(PROFILE);
    expect(second.store.aiDrafts.get().outbox.map((m) => m.id)).toEqual(['id-9']);
    await second.outbox.flushOutbox();
    expect(mocks.send).toHaveBeenCalledWith(
      CHAT_ONE,
      'unsent',
      [],
      expect.objectContaining({ clientMessageId: 'id-9' }),
    );
    expect(second.store.aiDrafts.get().outbox).toEqual([]);
  });
});

function firstQueued(store: typeof StoreModule): StoreModule.PendingMessage {
  const [first] = store.aiDrafts.get().outbox;
  if (first === undefined) throw new Error('nothing queued');
  return first;
}

function undoLatestToast(): void {
  const undo = mocks.notify.mock.calls.at(-1)?.[0].undo;
  if (undo === undefined) throw new Error('no undo toast was shown');
  undo();
}

describe('removing a waiting message', () => {
  it('drops it at once so it is never delivered', async () => {
    const { store, outbox } = await boot();
    await store.bindAiDraftsProfile(PROFILE);
    await queued(outbox, CHAT_ONE, 'first', 'id-1');
    await queued(outbox, CHAT_ONE, 'second', 'id-2');
    outbox.removePending(firstQueued(store));
    expect(store.aiDrafts.get().outbox.map((m) => m.id)).toEqual(['id-2']);
    await outbox.flushOutbox();
    expect(sentTexts()).toEqual(['second']);
  });

  it('restores the removed message ahead of newer ones on undo', async () => {
    const { store, outbox } = await boot();
    await store.bindAiDraftsProfile(PROFILE);
    vi.useFakeTimers({ toFake: ['Date'] });
    await queued(outbox, CHAT_ONE, 'first', 'id-1');
    outbox.removePending(firstQueued(store));
    vi.setSystemTime(Date.now() + 1000);
    await queued(outbox, CHAT_ONE, 'second', 'id-2');
    undoLatestToast();
    vi.useRealTimers();
    expect(store.aiDrafts.get().outbox.map((m) => m.id)).toEqual(['id-1', 'id-2']);
  });
});
