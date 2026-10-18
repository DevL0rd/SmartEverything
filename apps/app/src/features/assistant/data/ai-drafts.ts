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

const log = new Logger('app.ai-drafts');

export const DEFAULT_DRAFT_KEY = 'coordinator';

const SAVE_DELAY_MS = 500;

export interface DraftSubmission {
  readonly id: string;
  readonly payload: string;
}

export interface Draft {
  readonly text: string;
  readonly revision: number;
  readonly references: readonly AiMessageReference[];
  readonly submission?: DraftSubmission;
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
  readonly state: 'waiting' | 'failed';
  readonly reason: string | null;
}

export interface AiDraftsState {
  readonly drafts: Readonly<Record<string, Draft>>;
  readonly quotes: Readonly<Record<string, Quote>>;
  readonly uploads: readonly Upload[];
  readonly outbox: readonly PendingMessage[];
}

const EMPTY: AiDraftsState = { drafts: {}, quotes: {}, uploads: [], outbox: [] };

const STORED = z.strictObject({
  drafts: z.record(
    z.string(),
    z.strictObject({
      text: z.string(),
      references: AI_MESSAGE_REFERENCES,
      submission: z.strictObject({ id: z.string(), payload: z.string() }).optional(),
    }),
  ),
  quotes: z.record(z.string(), z.strictObject({ who: z.string(), text: z.string() })),
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
      state: z.enum(['waiting', 'failed']),
      reason: z.string().nullable(),
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
        .map(([key, { text, references, submission }]) => [
          key,
          { text, references, ...(submission === undefined ? {} : { submission }) },
        ]),
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
      Object.entries(stored.drafts).map(([key, { text, references, submission }]) => [
        key,
        {
          text,
          references,
          revision: 0,
          ...(submission === undefined ? {} : { submission }),
        },
      ]),
    ),
    quotes: stored.quotes,
    uploads: stored.uploads.map((upload) => ({
      ...upload,
      preview: null,
      progress: upload.attachment === null ? 0 : 1,
      state: upload.attachment === null ? 'failed' : 'done',
      failure: upload.attachment === null ? INTERRUPTED_UPLOAD : null,
    })),
    outbox: stored.outbox,
  };
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
