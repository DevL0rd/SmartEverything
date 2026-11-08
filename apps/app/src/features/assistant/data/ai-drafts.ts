import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { z } from 'zod';
import {
  AI_MESSAGE_REFERENCES,
  ASSISTANT_ATTACHMENT,
  type AiMessageReference,
  type AssistantAttachment,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { ValueStore, usePausable } from '../../../design/external-store';
import { jsonText } from '../../../format/json-text';
import type { Quote } from '../model/composer-state';
import { HELPER_MENTION, type HelperMention } from '../model/helper-target';
import { DRAFT_SUBMISSION_PAYLOAD, decodeDraftSubmission } from './draft-submission-content';

const log = new Logger('app.ai-drafts');

export const DEFAULT_DRAFT_KEY = 'coordinator';

const SAVE_DELAY_MS = 500;

export interface DraftSubmission {
  readonly id: string;
  readonly payload: string;
  readonly chat?: { readonly id: string; readonly sessionKey: string };
  readonly quote?: Quote | null;
}

export interface Draft {
  readonly text: string;
  readonly revision: number;
  readonly references: readonly AiMessageReference[];
  readonly submission?: DraftSubmission;
  readonly helperMentions?: readonly HelperMention[] | undefined;
}

export interface UploadFailure {
  readonly text: string;
  readonly retryable: boolean;
}

const INTERRUPTED_UPLOAD: UploadFailure = {
  text: 'Interrupted · Re-attach',
  retryable: false,
};

export interface Upload {
  readonly key: string;
  readonly draftKey: string;
  readonly name: string;
  readonly mime: string;
  readonly preview: string | null;
  readonly progress: number;
  readonly state: 'uploading' | 'done' | 'failed';
  readonly attachment: AssistantAttachment | null;
  readonly failure: UploadFailure | null;
}

export interface PendingMessage {
  readonly id: string;
  readonly chatId: string;
  readonly text: string;
  readonly attachments: readonly string[];
  readonly queuedAt: string;
  readonly references: readonly AiMessageReference[];
  readonly quoteMessageId?: string;
}

export interface AiDraftsState {
  readonly drafts: Readonly<Record<string, Draft>>;
  readonly quotes: Readonly<Record<string, Quote>>;
  readonly uploads: readonly Upload[];
  readonly outbox: readonly PendingMessage[];
}

const EMPTY: AiDraftsState = { drafts: {}, quotes: {}, uploads: [], outbox: [] };

const STORED_QUOTE = z.strictObject({
  messageId: z.uuid(),
  who: z.string(),
  text: z.string(),
  helperChatId: z.uuid().optional(),
});

const STORED = z.strictObject({
  drafts: z.record(
    z.string(),
    z.strictObject({
      text: z.string(),
      references: AI_MESSAGE_REFERENCES,
      helperMentions: z.array(HELPER_MENTION).optional(),
      submission: z
        .strictObject({
          id: z.string(),
          payload: DRAFT_SUBMISSION_PAYLOAD,
          chat: z.strictObject({ id: z.string(), sessionKey: z.string() }).optional(),
          quote: STORED_QUOTE.nullable().optional(),
        })
        .optional(),
    }),
  ),
  quotes: z.record(z.string(), STORED_QUOTE),
  uploads: z.array(
    z.strictObject({
      key: z.string(),
      draftKey: z.string(),
      name: z.string(),
      mime: z.string(),
      attachment: ASSISTANT_ATTACHMENT.nullable(),
    }),
  ),
  outbox: z.array(
    z.strictObject({
      id: z.string(),
      chatId: z.string(),
      text: z.string(),
      attachments: z.array(z.string()),
      queuedAt: z.string(),
      references: AI_MESSAGE_REFERENCES,
      quoteMessageId: z.uuid().optional(),
    }),
  ),
});

type Stored = z.infer<typeof STORED>;

export const aiDrafts = new ValueStore<AiDraftsState>(EMPTY);

export function patchAiDrafts<K extends keyof AiDraftsState>(
  slice: K,
  change: (current: AiDraftsState[K]) => AiDraftsState[K],
): void {
  aiDrafts.update((state) => ({ ...state, [slice]: change(state[slice]) }));
}

export function useAiDrafts<T>(select: (state: AiDraftsState) => T): T {
  return usePausable(aiDrafts.subscribe, () => select(aiDrafts.get()));
}

function serialized(state: AiDraftsState): string {
  return JSON.stringify({
    drafts: Object.fromEntries(
      Object.entries(state.drafts)
        .filter(([, draft]) => draft.text !== '' || draft.submission !== undefined)
        .map(([key, { revision: _revision, ...draft }]) => [key, draft]),
    ),
    quotes: state.quotes,
    uploads: state.uploads.map(({ key, draftKey, name, mime, attachment }) => ({
      key,
      draftKey,
      name,
      mime,
      attachment,
    })),
    outbox: state.outbox,
  });
}

function restored(stored: Stored): AiDraftsState {
  return {
    drafts: Object.fromEntries(
      Object.entries(stored.drafts).map(([key, draft]) => [key, restoredDraft(draft)]),
    ),
    quotes: restoredQuotes(stored),
    uploads: stored.uploads.map((upload) => ({
      ...upload,
      preview: null,
      progress: upload.attachment === null ? 0 : 1,
      state: upload.attachment === null ? 'failed' : 'done',
      failure: upload.attachment === null ? INTERRUPTED_UPLOAD : null,
    })),
    outbox: stored.outbox.map(({ quoteMessageId, ...message }) => ({
      ...message,
      ...(quoteMessageId === undefined ? {} : { quoteMessageId }),
    })),
  };
}

function restoredSubmission(
  stored: NonNullable<Stored['drafts'][string]['submission']>,
): DraftSubmission {
  const { chat, quote, ...submission } = stored;
  return {
    ...submission,
    ...(chat === undefined ? {} : { chat }),
    ...(quote === undefined ? {} : { quote }),
  };
}

function restoredDraft(stored: Stored['drafts'][string]): Draft {
  const { submission, ...draft } = stored;
  const recovery =
    draft.text === '' && submission !== undefined
      ? decodeDraftSubmission(submission.payload)
      : null;
  return {
    ...draft,
    ...(recovery?.kind === 'ordinary'
      ? { text: recovery.text, references: recovery.references }
      : {}),
    revision: 0,
    ...(submission === undefined ? {} : { submission: restoredSubmission(submission) }),
  };
}

function restoredQuotes(stored: Stored): Readonly<Record<string, Quote>> {
  const recovered = Object.fromEntries(
    Object.entries(stored.drafts).flatMap(([key, draft]) => {
      if (draft.text !== '' || draft.submission === undefined) return [];
      const content = decodeDraftSubmission(draft.submission.payload);
      if (content.kind !== 'ordinary' || content.quoteMessageId === null) return [];
      const quote = draft.submission.quote ?? {
        messageId: content.quoteMessageId,
        who: 'Quoted message',
        text: '',
      };
      return [[key, quote]];
    }),
  );
  return { ...recovered, ...stored.quotes };
}

function merged(loaded: AiDraftsState, current: AiDraftsState): AiDraftsState {
  const uploads = new Set(current.uploads.map((item) => item.key));
  const outbox = new Set(current.outbox.map((item) => item.id));
  return {
    drafts: { ...loaded.drafts, ...current.drafts },
    quotes: { ...loaded.quotes, ...current.quotes },
    uploads: [...loaded.uploads.filter((item) => !uploads.has(item.key)), ...current.uploads],
    outbox: [...loaded.outbox.filter((item) => !outbox.has(item.id)), ...current.outbox],
  };
}

const storageKey = (profileId: string): string => `smarteverything.ai-drafts.${profileId}`;

async function readProfile(profileId: string): Promise<AiDraftsState> {
  const text = await AsyncStorage.getItem(storageKey(profileId));
  if (text === null) return EMPTY;
  const read = jsonText(text);
  const parsed = read.ok ? STORED.safeParse(read.value) : null;
  if (parsed?.success !== true) {
    log.warn('ai_drafts.unreadable', { profileId });
    return EMPTY;
  }
  return restored(parsed.data);
}

interface Binding {
  profileId: string | null;
  ready: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  written: string;
  last: AiDraftsState;
  chain: Promise<void>;
}

const binding: Binding = {
  profileId: null,
  ready: false,
  timer: null,
  written: '',
  last: EMPTY,
  chain: Promise.resolve(),
};

async function write(profileId: string, state: AiDraftsState): Promise<void> {
  const text = serialized(state);
  if (text === binding.written) return;
  binding.written = text;
  const empty = text === serialized(EMPTY);
  try {
    if (empty) await AsyncStorage.removeItem(storageKey(profileId));
    else await AsyncStorage.setItem(storageKey(profileId), text);
  } catch (error) {
    binding.written = '';
    log.warn('ai_drafts.not_saved', { reason: String(error) });
  }
}

function cancelTimer(): void {
  if (binding.timer === null) return;
  clearTimeout(binding.timer);
  binding.timer = null;
}

function saveAiDraftsNow(): Promise<void> {
  cancelTimer();
  if (binding.profileId === null || !binding.ready) return Promise.resolve();
  return write(binding.profileId, aiDrafts.get());
}

function scheduleSave(): void {
  binding.timer ??= setTimeout(() => {
    binding.timer = null;
    background(saveAiDraftsNow(), 'ai_drafts_now.save_failed');
  }, SAVE_DELAY_MS);
}

aiDrafts.subscribe(() => {
  const next = aiDrafts.get();
  const outboxChanged = next.outbox !== binding.last.outbox;
  binding.last = next;
  if (!binding.ready) return;
  if (outboxChanged) background(saveAiDraftsNow(), 'ai_drafts_now.save_failed');
  else scheduleSave();
});

async function switchProfile(profileId: string): Promise<void> {
  if (binding.profileId === profileId) return;
  await saveAiDraftsNow();
  binding.ready = false;
  binding.profileId = profileId;
  binding.written = '';
  aiDrafts.set(EMPTY);
  const loaded = await readProfile(profileId);
  const edited = aiDrafts.get() !== EMPTY;
  aiDrafts.set(merged(loaded, aiDrafts.get()));
  binding.written = serialized(loaded);
  binding.ready = true;
  if (edited) await saveAiDraftsNow();
}

export function bindAiDraftsProfile(profileId: string): Promise<void> {
  binding.chain = binding.chain.then(() => switchProfile(profileId));
  return binding.chain;
}

export function useAiDraftsStore(profileId: string | null): void {
  useEffect(() => {
    if (profileId !== null)
      background(bindAiDraftsProfile(profileId), 'ai_drafts_profile.bind_failed');
  }, [profileId]);
  useEffect(() => {
    const app = AppState.addEventListener('change', (status) => {
      if (status !== 'active') background(saveAiDraftsNow(), 'ai_drafts_now.save_failed');
    });
    return (): void => {
      app.remove();
    };
  }, []);
}
