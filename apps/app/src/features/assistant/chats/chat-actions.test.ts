import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine } from '@smarteverything/domain';
import type * as ExternalStore from '../../../design/external-store';
import type * as ChatActions from './chat-actions';
import type * as DeferredAction from '../../../components/deferred-action';
import type * as ToastStore from '../../../components/toast-store';

const api = vi.hoisted(() => ({
  createAiChat: vi.fn(),
  removeAiChat: vi.fn(),
  updateAiChat: vi.fn(),
}));

vi.mock('../../../api/ai', () => ({
  compactAiChat: vi.fn(),
  createAiChat: api.createAiChat,
  interruptAiChat: vi.fn(),
  removeAiChat: api.removeAiChat,
  sendAiChatMessage: vi.fn(),
  updateAiChat: api.updateAiChat,
}));

vi.mock('../data/uploads', () => ({ clearUploads: vi.fn() }));

vi.mock('../browser/browser-runtime', () => ({ forgetBrowserChat: vi.fn() }));

vi.mock('../../../design/external-store', async (original) => ({
  ...(await original<typeof ExternalStore>()),
  useValue: <T>(store: { get: () => T }): T => store.get(),
}));

async function fresh(): Promise<{
  readonly actions: typeof ChatActions;
  readonly deferred: typeof DeferredAction;
  readonly toasts: typeof ToastStore;
}> {
  vi.resetModules();
  const toasts = await import('../../../components/toast-store');
  toasts.setToastCapacity(10);
  return {
    actions: await import('./chat-actions'),
    deferred: await import('../../../components/deferred-action'),
    toasts,
  };
}

it('leaves a Quick Ask chat unnamed so its first request can supply a title', async () => {
  const { actions } = await fresh();
  const engine: Engine = {
    kind: 'dsh',
    execution_target: { kind: 'server' },
    session_id: null,
    model_route_id: '20000000-0000-4000-8000-000000000001',
    model: 'fixture/coordinator',
    effort: null,
    permission: { sandbox: 'danger-full-access', approval: 'never' },
  };
  api.createAiChat.mockReset().mockRejectedValueOnce(new Error('Fixture stopped before sending'));
  await expect(actions.chatStarter(engine, vi.fn())('Garden lights', [])).resolves.toBe(false);
  expect(api.createAiChat).toHaveBeenCalledExactlyOnceWith({ engine });
});

describe('chat delete and archive with undo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.removeAiChat.mockReset().mockResolvedValue(undefined);
    api.updateAiChat.mockReset().mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides a deleted chat at once and removes it on the hub only after the undo window', async () => {
    const { actions, deferred } = await fresh();
    actions.deleteChat({ id: 'chat-1' });
    expect(deferred.usePendingKeys().has('chat-1')).toBe(true);
    await vi.advanceTimersByTimeAsync(7999);
    expect(api.removeAiChat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(api.removeAiChat).toHaveBeenCalledWith('chat-1');
  });

  it('restores a deleted chat and never calls the hub when Undo is used', async () => {
    const { actions, deferred, toasts } = await fresh();
    actions.deleteChat({ id: 'chat-1' });
    expect(toasts.undoLatestToast()).toBe(true);
    expect(deferred.usePendingKeys().has('chat-1')).toBe(false);
    await vi.advanceTimersByTimeAsync(20000);
    expect(api.removeAiChat).not.toHaveBeenCalled();
  });

  it('archives after the undo window and unarchives at once', async () => {
    const { actions } = await fresh();
    actions.setChatArchived('chat-2', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.updateAiChat).toHaveBeenCalledWith('chat-2', { archived: false });
    api.updateAiChat.mockClear();
    actions.setChatArchived('chat-2', true);
    await vi.advanceTimersByTimeAsync(7999);
    expect(api.updateAiChat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(api.updateAiChat).toHaveBeenCalledWith('chat-2', { archived: true });
  });
});
