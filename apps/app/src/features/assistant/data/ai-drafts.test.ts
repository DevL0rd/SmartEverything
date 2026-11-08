import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AssistantAttachment } from '@smarteverything/domain';
import type { PickedFile } from '../../../platform/pick-files';
import type * as StoreModule from './ai-drafts';
import type * as DraftsModule from './drafts';
import type * as UploadsModule from './uploads';
import type * as OutboxModule from './outbox';

const mocks = vi.hoisted(() => ({
  disk: new Map<string, string>(),
  setItem: vi.fn(),
  uploadStart: vi.fn(),
  uploadFinish: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string): Promise<string | null> => Promise.resolve(mocks.disk.get(key) ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      mocks.setItem(key, value);
      mocks.disk.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string): Promise<void> => {
      mocks.disk.delete(key);
      return Promise.resolve();
    },
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => randomUUID() }));
vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../api/ai', () => ({ sendAiChatMessage: vi.fn() }));
vi.mock('../../../api/assistant', () => ({
  startAssistantUpload: mocks.uploadStart,
  sendAssistantUploadChunk: vi.fn(() => Promise.resolve()),
  finishAssistantUpload: mocks.uploadFinish,
}));

const PROFILE_A = '00000000-0000-4000-8000-00000000000a';
const PROFILE_B = '00000000-0000-4000-8000-00000000000b';
const CHAT = '00000000-0000-4000-8000-0000000000c1';
const KEY_A = `smarteverything.ai-drafts.${PROFILE_A}`;
const HELPER = '00000000-0000-4000-8000-0000000000a1';
const QUOTED = '00000000-0000-4000-8000-0000000000a2';

const ATTACHMENT: AssistantAttachment = {
  id: '00000000-0000-4000-8000-0000000000f1',
  name: 'plan.png',
  mime: 'image/png',
  bytes: 4,
  width: null,
  height: null,
};

function file(name: string): PickedFile {
  return {
    name,
    mime: 'image/png',
    bytes: 4,
    preview: null,
    data: () => Promise.resolve(new ArrayBuffer(4)),
  };
}

async function boot(): Promise<{
  readonly store: typeof StoreModule;
  readonly drafts: typeof DraftsModule;
  readonly uploads: typeof UploadsModule;
  readonly outbox: typeof OutboxModule;
}> {
  vi.resetModules();
  const store = await import('./ai-drafts');
  const drafts = await import('./drafts');
  const uploads = await import('./uploads');
  const outbox = await import('./outbox');
  return { store, drafts, uploads, outbox };
}

beforeAll(async () => {
  await boot();
}, 30_000);

beforeEach(() => {
  vi.useFakeTimers();
  mocks.disk.clear();
  mocks.setItem.mockClear();
  mocks.uploadStart.mockReset();
  mocks.uploadFinish.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ai-drafts persistence', () => {
  it.each([
    { outcome: 'a lost response', error: new Error('Connection ended') },
    {
      outcome: 'a helper readiness refusal',
      error: new ApiError(
        'conflict',
        'This helper needs its original execution host and an open parent conversation.',
      ),
    },
  ])('restores a directed draft and its submission ID after $outcome', async ({ error }) => {
    const first = await boot();
    const { sendAiChatMessage } = await import('../../../api/ai');
    const { notify } = await import('../../../components/toast-store');
    const { sendHelper } = await import('./send-helper');
    vi.mocked(sendAiChatMessage).mockRejectedValueOnce(error);
    await first.store.bindAiDraftsProfile(PROFILE_A);
    const quote = {
      who: 'Nova',
      text: 'Earlier reply',
      messageId: QUOTED,
      helperChatId: HELPER,
    };
    const mentions = [{ chatId: HELPER, name: 'Nova', token: '@Nova', start: 0, end: 5 }];
    const target = { chat_id: HELPER };
    first.drafts.setReferenceDraft(
      CHAT,
      { text: '@Nova Why?', references: [] },
      undefined,
      mentions,
    );
    first.drafts.quoteInto(CHAT, quote);
    expect(
      await sendHelper({ key: CHAT, target, mentions, quote, attachments: [], uploadKeys: [] }),
    ).toBe(false);
    expect(notify).toHaveBeenLastCalledWith({ message: error.message, error, tone: 'critical' });
    const saved = first.store.aiDrafts.get().drafts[CHAT];
    expect(saved?.submission?.id).toBeDefined();
    expect(sendAiChatMessage).toHaveBeenLastCalledWith(CHAT, 'Why?', [], {
      clientMessageId: saved?.submission?.id,
      helperTarget: target,
      quoteMessageId: QUOTED,
    });
    await vi.advanceTimersByTimeAsync(500);

    const second = await boot();
    await second.store.bindAiDraftsProfile(PROFILE_A);
    expect(second.store.aiDrafts.get().drafts[CHAT]).toMatchObject({
      text: '@Nova Why?',
      helperMentions: mentions,
    });
    expect(second.drafts.draftQuote(CHAT)).toEqual(quote);
    expect(
      second.drafts.captureDraftSubmission(CHAT, {
        text: 'Why?',
        attachments: [],
        helperTarget: target,
        quoteMessageId: QUOTED,
      }),
    ).toEqual(saved?.submission);
  });
  it('retries a quoted attachment-only helper draft with the same IDs', async () => {
    const first = await boot();
    const { sendAiChatMessage } = await import('../../../api/ai');
    const { sendHelper } = await import('./send-helper');
    vi.mocked(sendAiChatMessage).mockRejectedValueOnce(new Error('Connection ended'));
    await first.store.bindAiDraftsProfile(PROFILE_A);
    const quote = {
      who: 'Nova',
      text: 'Earlier reply',
      messageId: QUOTED,
      helperChatId: HELPER,
    };
    const target = { chat_id: HELPER };
    const upload = {
      key: 'submitted',
      draftKey: CHAT,
      name: ATTACHMENT.name,
      mime: ATTACHMENT.mime,
      progress: 1,
      state: 'done' as const,
      preview: null,
      failure: null,
      attachment: ATTACHMENT,
    };
    first.store.patchAiDrafts('uploads', () => [upload, { ...upload, key: 'unsubmitted' }]);
    first.drafts.quoteInto(CHAT, quote);
    const submission = {
      key: CHAT,
      target,
      mentions: [],
      quote,
      attachments: [ATTACHMENT.id],
      uploadKeys: [upload.key],
    };
    expect(await sendHelper(submission)).toBe(false);
    const id = first.store.aiDrafts.get().drafts[CHAT]?.submission?.id;
    expect(id).toBeDefined();
    await vi.advanceTimersByTimeAsync(500);

    const second = await boot();
    await second.store.bindAiDraftsProfile(PROFILE_A);
    const restoredQuote = second.drafts.draftQuote(CHAT);
    expect(restoredQuote).toEqual(quote);
    expect(second.store.aiDrafts.get().uploads.map(({ key }) => key)).toEqual([
      'submitted',
      'unsubmitted',
    ]);
    const restored = await import('./send-helper');
    expect(await restored.sendHelper({ ...submission, quote: restoredQuote })).toBe(true);
    expect(sendAiChatMessage).toHaveBeenLastCalledWith(CHAT, '', [ATTACHMENT.id], {
      clientMessageId: id,
      helperTarget: target,
      quoteMessageId: QUOTED,
    });
    expect(second.store.aiDrafts.get().uploads.map(({ key }) => key)).toEqual(['unsubmitted']);
    expect(second.drafts.draftQuote(CHAT)).toBeNull();
  });
  it('gives a draft a new submission id when its quote changes', async () => {
    const first = await boot();
    await first.store.bindAiDraftsProfile(PROFILE_A);
    const content = { text: 'Why?', attachments: [], references: [] };
    const plain = first.drafts.captureDraftSubmission(CHAT, content);
    const quoted = first.drafts.captureDraftSubmission(CHAT, {
      ...content,
      quoteMessageId: QUOTED,
    });
    expect(quoted.id).not.toBe(plain.id);
    expect(
      first.drafts.captureDraftSubmission(CHAT, { ...content, quoteMessageId: QUOTED }),
    ).toEqual(quoted);
  });

  it('restores draft text, quote and the new-chat draft after a restart', async () => {
    const first = await boot();
    await first.store.bindAiDraftsProfile(PROFILE_A);
    first.drafts.setDraft(CHAT, 'half a thought');
    first.drafts.setDraft('new-chat', 'start from here');
    first.drafts.quoteInto(CHAT, { messageId: QUOTED, who: 'AI', text: 'quoted' });
    await vi.advanceTimersByTimeAsync(500);

    const second = await boot();
    await second.store.bindAiDraftsProfile(PROFILE_A);
    const { drafts, quotes } = second.store.aiDrafts.get();
    expect(drafts[CHAT]?.text).toBe('half a thought');
    expect(drafts['new-chat']?.text).toBe('start from here');
    expect(quotes[CHAT]).toEqual({ messageId: QUOTED, who: 'AI', text: 'quoted' });
  });

  it('writes a burst of keystrokes once, 500 ms after the first', async () => {
    const { store, drafts } = await boot();
    await store.bindAiDraftsProfile(PROFILE_A);
    drafts.setDraft(CHAT, 'a');
    await vi.advanceTimersByTimeAsync(200);
    drafts.setDraft(CHAT, 'ab');
    await vi.advanceTimersByTimeAsync(200);
    drafts.setDraft(CHAT, 'abc');
    expect(mocks.setItem).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.setItem).toHaveBeenCalledTimes(1);
    expect(mocks.disk.get(KEY_A)).toContain('"abc"');
  });

  it('saves an outbox change at once and keeps profiles apart', async () => {
    const { store, drafts, outbox } = await boot();
    await store.bindAiDraftsProfile(PROFILE_A);
    drafts.setDraft(CHAT, 'private to A');
    await outbox.outboxSender(CHAT, false)('hello later', []);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.disk.get(KEY_A)).toContain('hello later');

    await store.bindAiDraftsProfile(PROFILE_B);
    expect(store.aiDrafts.get().outbox).toEqual([]);
    expect(store.aiDrafts.get().drafts[CHAT]).toBeUndefined();

    await store.bindAiDraftsProfile(PROFILE_A);
    expect(store.aiDrafts.get().drafts[CHAT]?.text).toBe('private to A');
    expect(store.aiDrafts.get().outbox.map((message) => message.text)).toEqual(['hello later']);
  });

  it('discards unreadable stored data instead of failing', async () => {
    mocks.disk.set(KEY_A, '{"drafts": 4}');
    const { store } = await boot();
    await store.bindAiDraftsProfile(PROFILE_A);
    expect(store.aiDrafts.get().drafts).toEqual({});
  });

  it('removes the stored entry once nothing is left to keep', async () => {
    const { store, drafts } = await boot();
    await store.bindAiDraftsProfile(PROFILE_A);
    drafts.setDraft(CHAT, 'x');
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.disk.has(KEY_A)).toBe(true);
    drafts.setDraft(CHAT, '');
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.disk.has(KEY_A)).toBe(false);
  });
});

describe('unsent uploads', () => {
  it('restores finished uploads as chips and interrupted ones as failed without a source', async () => {
    mocks.uploadStart.mockImplementation(({ name }: { readonly name: string }) =>
      name === 'stuck.png'
        ? new Promise(() => undefined)
        : Promise.resolve({ uploadId: 'u1', chunkBytes: 8 }),
    );
    mocks.uploadFinish.mockResolvedValue(ATTACHMENT);
    const first = await boot();
    await first.store.bindAiDraftsProfile(PROFILE_A);
    first.uploads.attachFiles([file('plan.png'), file('stuck.png')], CHAT);
    await vi.advanceTimersByTimeAsync(500);

    const second = await boot();
    await second.store.bindAiDraftsProfile(PROFILE_A);
    const restored = second.store.aiDrafts.get().uploads;
    expect(restored.map((upload) => [upload.name, upload.state, upload.failure])).toEqual([
      ['plan.png', 'done', null],
      ['stuck.png', 'failed', { text: 'Interrupted · Re-attach', retryable: false }],
    ]);
    expect(restored.every((upload) => upload.draftKey === CHAT)).toBe(true);
    const stuck = restored[1];
    second.uploads.retryUpload(stuck?.key ?? '');
    expect(second.store.aiDrafts.get().uploads[1]?.state).toBe('failed');
    expect(second.uploads.readyAttachments(restored)).toBeNull();
  });

  it('marks a file over the limit as failed on its chip without uploading it', async () => {
    const { store, uploads } = await boot();
    await store.bindAiDraftsProfile(PROFILE_A);
    uploads.attachFiles([{ ...file('backup.zip'), bytes: 31 * 1024 * 1024 }], CHAT);
    const [chip] = store.aiDrafts.get().uploads;
    expect(chip?.state).toBe('failed');
    expect(chip?.failure).toEqual({
      text: 'Too large · 31\u00A0MB of 25\u00A0MB',
      retryable: false,
    });
    expect(mocks.uploadStart).not.toHaveBeenCalled();
    uploads.retryUpload(chip?.key ?? '');
    expect(mocks.uploadStart).not.toHaveBeenCalled();
  });

  it('marks a file of unknown size that turns out too large when it is read', async () => {
    const { store, uploads } = await boot();
    await store.bindAiDraftsProfile(PROFILE_A);
    const big = {
      ...file('clip.mov'),
      bytes: 0,
      data: (): Promise<ArrayBuffer> => Promise.resolve(new ArrayBuffer(26 * 1024 * 1024)),
    };
    uploads.attachFiles([big], CHAT);
    await vi.waitFor(() => {
      expect(store.aiDrafts.get().uploads[0]?.failure).toEqual({
        text: 'Too large · 26\u00A0MB of 25\u00A0MB',
        retryable: false,
      });
    });
  });

  it('keeps uploads per draft key: clearing one chat leaves the others', async () => {
    mocks.uploadStart.mockReturnValue(new Promise(() => undefined));
    const { store, uploads, drafts } = await boot();
    await store.bindAiDraftsProfile(PROFILE_A);
    uploads.attachFiles([file('one.png')], 'chat-1');
    uploads.attachFiles([file('two.png')], 'chat-2');
    uploads.clearUploads('chat-1');
    expect(store.aiDrafts.get().uploads.map((upload) => upload.name)).toEqual(['two.png']);
    drafts.moveDraft('chat-2', 'chat-3');
    expect(store.aiDrafts.get().uploads.map((upload) => upload.draftKey)).toEqual(['chat-3']);
  });
});
