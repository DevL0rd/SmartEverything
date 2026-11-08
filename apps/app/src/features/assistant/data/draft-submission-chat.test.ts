import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DraftStore from './ai-drafts';
import type * as Drafts from './drafts';
import { AI_MESSAGE_REFERENCE } from '@smarteverything/domain';
import { startChatWithMessage } from '../model/draft-chat-request';

const disk = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string): Promise<string | null> => Promise.resolve(disk.get(key) ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      disk.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string): Promise<void> => {
      disk.delete(key);
      return Promise.resolve();
    },
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => randomUUID() }));
vi.mock('./uploads', () => ({ moveUploads: vi.fn() }));
const PROFILE_A = 'profile-a';
const PROFILE_B = 'profile-b';
const CHAT = 'chat-created';
const ATTACHMENT = { id: 'attachment' };
async function boot(): Promise<{
  readonly store: typeof DraftStore;
  readonly drafts: typeof Drafts;
}> {
  vi.resetModules();
  return { store: await import('./ai-drafts'), drafts: await import('./drafts') };
}
beforeEach(() => {
  vi.useFakeTimers();
  disk.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('first-message request ownership', () => {
  it('keeps a created chat bound to an uncertain first message through restore and restart', async () => {
    const first = await boot();
    await first.store.bindAiDraftsProfile(PROFILE_A);
    const content = { text: 'First request', attachments: [ATTACHMENT.id], references: [] };
    first.drafts.setDraft('new-chat', content.text);
    const submission = first.drafts.captureDraftSubmission('new-chat', content);
    first.drafts.clearDraft('new-chat', submission);
    first.drafts.bindDraftSubmissionChat('new-chat', submission.id, {
      id: CHAT,
      sessionKey: 'home',
    });
    const bound = first.drafts.draftSubmission('new-chat', submission.id);
    first.drafts.setReferenceDraft('new-chat', content, bound);
    await first.store.bindAiDraftsProfile(PROFILE_B);
    const second = await boot();
    await second.store.bindAiDraftsProfile(PROFILE_A);
    expect(second.drafts.captureDraftSubmission('new-chat', content)).toEqual({
      ...submission,
      chat: { id: CHAT, sessionKey: 'home' },
    });
    const edited = second.drafts.captureDraftSubmission('new-chat', { ...content, text: 'Edited' });
    expect(edited.id).not.toBe(submission.id);
    expect(edited.chat).toBeUndefined();
  });

  it('recovers exact pending content on cold restart before its first send settles', async () => {
    const first = await boot();
    await first.store.bindAiDraftsProfile(PROFILE_A);
    const reference = AI_MESSAGE_REFERENCE.parse({
      reference: { kind: 'plugin', asset_id: 'plugin', revision: 'r' },
      label: 'Plugin',
      token: '@Plugin',
      start: 0,
      end: 7,
    });
    const quote = {
      messageId: '00000000-0000-4000-8000-000000000001',
      who: 'Nova',
      text: 'Earlier reply',
    };
    const attachment = {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'plan.txt',
      mime: 'text/plain',
      bytes: 4,
      width: null,
      height: null,
    };
    const content = {
      text: '@Plugin first request',
      references: [reference],
      attachments: [attachment.id],
      quoteMessageId: quote.messageId,
    };
    first.drafts.setReferenceDraft('new-chat', content);
    first.drafts.quoteInto('new-chat', quote);
    first.store.aiDrafts.update((state) => ({
      ...state,
      uploads: [
        {
          key: 'submitted-file',
          draftKey: 'new-chat',
          name: attachment.name,
          mime: attachment.mime,
          attachment,
          preview: null,
          progress: 1,
          state: 'done',
          failure: null,
        },
      ],
    }));
    const original = first.drafts.captureDraftSubmission('new-chat', content);
    first.drafts.clearDraft('new-chat', original);
    let acknowledge = (): void => {
      throw new Error('Expected a pending first send');
    };
    const pending = new Promise<null>((resolve) => {
      acknowledge = (): void => {
        resolve(null);
      };
    });
    const create = vi.fn(() => Promise.resolve({ id: CHAT }));
    const send = vi.fn(() => pending);
    const firstSend = startChatWithMessage({
      chatId: null,
      create,
      send,
      created: (id): void => {
        first.drafts.bindDraftSubmissionChat('new-chat', original.id, { id, sessionKey: 'home' });
      },
    });
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    await first.store.bindAiDraftsProfile(PROFILE_B);
    const second = await boot();
    await second.store.bindAiDraftsProfile(PROFILE_A);
    expect(second.drafts.draftText('new-chat')).toBe(content.text);
    expect(second.store.aiDrafts.get().drafts['new-chat']?.references).toEqual(content.references);
    expect(second.drafts.draftQuote('new-chat')).toEqual(quote);
    expect(second.store.aiDrafts.get().uploads.map((upload) => upload.attachment?.id)).toEqual(
      content.attachments,
    );
    const recovered = second.drafts.captureDraftSubmission('new-chat', content);
    expect(recovered.id).toBe(original.id);
    expect(recovered.chat).toEqual({ id: CHAT, sessionKey: 'home' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    const retryCreate = vi.fn(() => Promise.resolve({ id: 'duplicate' }));
    const retrySend = vi.fn((_id: string, _requestId: string) => Promise.resolve(null));
    expect(
      await startChatWithMessage({
        chatId: recovered.chat?.id ?? null,
        create: retryCreate,
        created: vi.fn(),
        send: (id) => retrySend(id, recovered.id),
      }),
    ).toEqual({ kind: 'sent', chatId: CHAT });
    expect(retryCreate).not.toHaveBeenCalled();
    expect(retrySend).toHaveBeenCalledExactlyOnceWith(CHAT, original.id);
    acknowledge();
    await firstSend;
  });

  it('preserves newer draft edits, quotes and attachments across pending-send hydration', async () => {
    const first = await boot();
    await first.store.bindAiDraftsProfile(PROFILE_A);
    first.drafts.setDraft('new-chat', 'Original request');
    const original = first.drafts.captureDraftSubmission('new-chat', {
      text: 'Original request',
      references: [],
      attachments: [],
    });
    first.drafts.clearDraft('new-chat', original);
    first.drafts.bindDraftSubmissionChat('new-chat', original.id, { id: CHAT, sessionKey: 'home' });
    first.drafts.setDraft('new-chat', 'Newer edit');
    const quote = {
      messageId: '00000000-0000-4000-8000-000000000003',
      who: 'Nova',
      text: 'Newer quote',
    };
    first.drafts.quoteInto('new-chat', quote);
    const attachment = {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'new.txt',
      mime: 'text/plain',
      bytes: 4,
      width: null,
      height: null,
    };
    first.store.aiDrafts.update((state) => ({
      ...state,
      uploads: [
        {
          key: 'new-file',
          draftKey: 'new-chat',
          name: attachment.name,
          mime: attachment.mime,
          attachment,
          preview: null,
          progress: 1,
          state: 'done',
          failure: null,
        },
      ],
    }));
    await first.store.bindAiDraftsProfile(PROFILE_B);
    const second = await boot();
    await second.store.bindAiDraftsProfile(PROFILE_A);
    expect(second.drafts.draftText('new-chat')).toBe('Newer edit');
    expect(second.drafts.draftQuote('new-chat')).toEqual(quote);
    expect(second.store.aiDrafts.get().uploads.map((upload) => upload.attachment?.id)).toEqual([
      attachment.id,
    ]);
    expect(second.drafts.draftSubmission('new-chat', original.id)).toBeUndefined();
  });

  it('recovers a stored quoted payload without inventing its missing display snapshot', async () => {
    const quoteMessageId = '00000000-0000-4000-8000-000000000005';
    const original = {
      id: 'retained-request',
      payload: JSON.stringify(['Original request', [], [], quoteMessageId]),
      chat: { id: CHAT, sessionKey: 'home' },
    };
    disk.set(
      `smarteverything.ai-drafts.${PROFILE_A}`,
      JSON.stringify({
        drafts: { 'new-chat': { text: '', references: [], submission: original } },
        quotes: {},
        uploads: [],
        outbox: [],
      }),
    );
    const { store, drafts } = await boot();
    await store.bindAiDraftsProfile(PROFILE_A);
    expect(drafts.draftText('new-chat')).toBe('Original request');
    expect(drafts.draftQuote('new-chat')).toEqual({
      messageId: quoteMessageId,
      who: 'Quoted message',
      text: '',
    });
    expect(
      drafts.captureDraftSubmission('new-chat', {
        text: 'Original request',
        attachments: [],
        references: [],
        quoteMessageId,
      }),
    ).toEqual(original);
  });

  it('hydrates outbox entries with absent and present quote IDs without adding undefined fields', async () => {
    const message = {
      id: 'pending',
      chatId: CHAT,
      text: 'Message',
      attachments: [],
      queuedAt: '2026-11-07T23:18:17.325Z',
      references: [],
    };
    disk.set(
      `smarteverything.ai-drafts.${PROFILE_A}`,
      JSON.stringify({
        drafts: {},
        quotes: {},
        uploads: [],
        outbox: [
          message,
          {
            ...message,
            id: 'quoted',
            quoteMessageId: '00000000-0000-4000-8000-000000000005',
          },
        ],
      }),
    );
    const { store } = await boot();
    await store.bindAiDraftsProfile(PROFILE_A);
    expect(store.aiDrafts.get().outbox).toEqual([
      message,
      {
        ...message,
        id: 'quoted',
        quoteMessageId: '00000000-0000-4000-8000-000000000005',
      },
    ]);
    expect(Object.hasOwn(store.aiDrafts.get().outbox[0] ?? {}, 'quoteMessageId')).toBe(false);
  });

  it('does not attach an old first-message chat to a draft edited during delivery', async () => {
    const { drafts } = await boot();
    drafts.setDraft('new-chat', 'First');
    const submission = drafts.captureDraftSubmission('new-chat', {
      text: 'First',
      attachments: [],
      references: [],
    });
    drafts.clearDraft('new-chat', submission);
    drafts.setDraft('new-chat', 'Next');
    drafts.bindDraftSubmissionChat('new-chat', submission.id, { id: CHAT, sessionKey: 'home' });
    drafts.clearDraftSubmission('new-chat', submission.id);
    expect(drafts.draftText('new-chat')).toBe('Next');
    expect(drafts.draftSubmission('new-chat', submission.id)).toBeUndefined();
  });
});
