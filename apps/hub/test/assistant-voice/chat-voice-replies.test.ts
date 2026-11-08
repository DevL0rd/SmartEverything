import { randomBytes, randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS,
  ApiError,
  mcpToolOperation,
  NO_PRICES,
  SPEECH_SAMPLE_RATE,
  type AiChatRow,
  type ChatVoiceReceipt,
} from '@smarteverything/domain';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatVoiceReplies } from '../../src/assistant-voice/chat-voice-replies';
import { ConversationLog } from '../../src/assistant/conversation-log';
import { AssistantFiles } from '../../src/assistant/files';
import { withProviderToolAuthority } from '../../src/assistant/engines/computer/tool-authority';
import { operationRunner } from '../../src/extensions/mcp/tools/operation-tools';
import { operationShape } from '../../src/extensions/mcp/tools/operation-shape';
import { eventAuthority } from '../../src/assistant/turn-authority';
import type { StoredEvent } from '../../src/store/repositories/assistant-events';
import type { Caller } from '../../src/server/auth';
import { withSignal } from '../../src/server/request-signal';
import { OneShotSpeech } from '../../src/speech/one-shot-speech';
import type { SpeechChunk, SpeechOptions } from '../../src/speech/speech-provider';
import { TEST_ENGINE } from '../support/engine';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { hubLayout } from '../../src/data-layout';

const TEXT = 'The greenhouse is ready.';
const PCM = Int16Array.of(1200, -2400, 3600);
let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});
afterEach(async () => {
  await opened.close();
});

interface Conversation {
  readonly caller: Extract<Caller, { kind: 'client' }>;
  readonly chat: AiChatRow;
  readonly event: StoredEvent;
}

interface ChatShape {
  readonly tools?: readonly string[] | null;
  readonly parentTools?: readonly string[] | null;
}

function chatFor(profileId: string, shape: ChatShape): AiChatRow {
  const { store } = opened;
  const base = { profileId, icon: null, sourceKey: null, engine: TEST_ENGINE };
  const parent =
    shape.parentTools === undefined
      ? null
      : store.aiChats.create({
          ...base,
          kind: 'chat',
          title: 'Garden',
          parentId: null,
          tools: shape.parentTools,
        });
  return store.aiChats.create({
    ...base,
    kind: parent === null ? 'chat' : 'subagent',
    title: 'Greenhouse',
    parentId: parent?.id ?? null,
    tools: shape.tools ?? null,
  });
}

function conversation(shape: ChatShape = {}): Conversation {
  const { store } = opened;
  const client = store.clients.create(
    {
      name: 'Owner',
      platform: 'android',
      role: 'owner',
      tokenHash: randomBytes(32).toString('hex'),
    },
    true,
  );
  const profileId = store.profiles.activeOf(client.id).id;
  const chat = chatFor(profileId, shape);
  const event = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'chat',
    chat_id: chat.id,
    message_id: null,
    profile_id: profileId,
    client_id: client.id,
    text: 'Send a voice reply',
  });
  store.assistantEvents.mark(event.id, 'delivered_at');
  const caller: Caller = {
    kind: 'client',
    via: 'assistant',
    client,
    profileId,
    chatId: chat.id,
    authority: eventAuthority(store, event),
  };
  return { caller, chat, event };
}

interface Fixture {
  readonly replies: ChatVoiceReplies;
  readonly requests: readonly SpeechOptions[];
  readonly files: AssistantFiles;
  readonly budget: { readonly check: ReturnType<typeof vi.fn> };
}

function fixture(beforeAudio: () => void = () => undefined): Fixture {
  const { store, directory } = opened;
  const requests: SpeechOptions[] = [];
  const speech = new OneShotSpeech({
    store,
    providers: {
      gemini: {
        synthesize: async function* (options): AsyncGenerator<SpeechChunk> {
          requests.push(options);
          beforeAudio();
          await Promise.resolve();
          yield { kind: 'audio', pcm: PCM };
          yield { kind: 'usage', usage: { inputTokens: 4, audioTokens: 8 } };
        },
      },
    },
    prices: {
      priceOf: (): typeof NO_PRICES => ({
        ...NO_PRICES,
        input_per_mtok: 0.5,
        audio_out_per_mtok: 6,
      }),
    },
    log: testLogger('voice-reply'),
  });
  const files = new AssistantFiles({
    chat: store.assistantChat,
    layout: hubLayout(directory, {}),
    now: (): Date => new Date(),
  });
  const budget = { check: vi.fn() };
  const replies = new ChatVoiceReplies({
    store,
    files,
    voice: speech,
    budget,
  });
  return { replies, requests, files, budget };
}

function messageIn(chat: AiChatRow, id: string): void {
  const message = opened.store.assistantChat.message(id);
  expect(message).toMatchObject({
    role: 'responder',
    chat_id: chat.id,
    text: '',
    attachments: [{ mime: 'audio/wav', name: 'Voice reply.wav', transcript: TEXT }],
  });
}

it('uses the selected speech model and voice to post playable PCM with its transcript in the calling chat once', async () => {
  const { store } = opened;
  const { caller, chat } = conversation();
  const settings = store.assistantChat.settings();
  store.assistantChat.saveSettings({
    ...settings,
    voice: { ...settings.voice, speech_model: 'gemini-3.8-flash-tts', speech_voice: 'Kore' },
  });
  const { replies, requests, files, budget } = fixture();
  const usage = vi.fn();
  store.ledger.on(usage);
  const input = { operationId: randomUUID(), text: TEXT };
  const work = replies.post(caller, input);
  await expect(replies.post(caller, input)).rejects.toThrow('already being generated');
  const result = await work;
  await expect(replies.post(caller, input)).resolves.toEqual(result);
  await expect(replies.post(caller, { ...input, text: 'Changed' })).rejects.toThrow(
    'different message',
  );
  messageIn(chat, result.messageId);
  expect(requests).toEqual([
    expect.objectContaining({ model: 'gemini-3.8-flash-tts', voice: 'Kore', text: TEXT }),
  ]);
  expect(budget.check).toHaveBeenCalledWith('speak', { profileId: chat.profile_id });
  expect(usage).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ chat_id: chat.id, work: 'speak' }),
  );
  const wav = await files.bytesOf(store.assistantChat.attachment(result.attachmentId));
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.readUInt32LE(24)).toBe(SPEECH_SAMPLE_RATE);
  expect(wav.readInt16LE(46)).toBe(-2400);
});

it('refuses callers with no turn, a different chat, or no tool grant before sending to the provider', async () => {
  const { caller } = conversation({ tools: [] });
  const { replies, requests } = fixture();
  const input = { text: TEXT };
  await expect(replies.post({ kind: 'client', client: caller.client }, input)).rejects.toThrow(
    'requires an active AI chat',
  );
  await expect(replies.post({ ...caller, chatId: randomUUID() }, input)).rejects.toThrow(
    'stays in its initiating chat',
  );
  await expect(replies.post(caller, input)).rejects.toThrow('does not expose this tool');
  expect(requests).toEqual([]);
});

it('speaks with the call voice when no separate voice is chosen for one-off lines', async () => {
  const { store } = opened;
  const settings = store.assistantChat.settings();
  store.assistantChat.saveSettings({
    ...settings,
    voice: { ...settings.voice, voice: 'Puck', speech_voice: null },
  });
  const { caller } = conversation();
  const { replies, requests } = fixture();
  await replies.post(caller, { text: TEXT });
  expect(requests).toEqual([
    expect.objectContaining({ model: settings.voice.speech_model, voice: 'Puck', text: TEXT }),
  ]);
});

it('answers by voice inside a helper chat as background work and keeps the clip in that chat', async () => {
  const { caller, chat } = conversation({ parentTools: null });
  const { replies, budget } = fixture();
  const result = await replies.post(caller, { text: TEXT });
  expect(chat.kind).toBe('subagent');
  expect(result.chatId).toBe(chat.id);
  messageIn(chat, result.messageId);
  expect(budget.check).toHaveBeenCalledWith('speak', {
    profileId: chat.profile_id,
    background: true,
  });
  expect(opened.store.assistantChat.since(chat.parent_id ?? '', null)).toEqual([]);
});

it('refuses a helper voice reply when its parent chat does not grant the tool', async () => {
  const { caller } = conversation({ parentTools: ['home_read'] });
  const { replies, requests } = fixture();
  await expect(replies.post(caller, { text: TEXT })).rejects.toThrow('does not expose this tool');
  expect(requests).toEqual([]);
});

it('checks the spending gate before synthesis', async () => {
  const { caller } = conversation();
  const { replies, requests, budget } = fixture();
  budget.check.mockImplementation(() => {
    throw new ApiError('forbidden', 'Synthetic budget limit');
  });
  await expect(replies.post(caller, { text: TEXT })).rejects.toThrow('Synthetic budget limit');
  expect(requests).toEqual([]);
});

it('does not post when the turn ends or the caller cancels during synthesis', async () => {
  const { caller, event } = conversation();
  const input = { operationId: randomUUID(), text: TEXT };
  const closed = fixture(() => {
    opened.store.assistantEvents.mark(event.id, 'answered_at');
  });
  await expect(closed.replies.post(caller, input)).rejects.toThrow('AI turn ended');
  expect(opened.store.assistantChat.find(input.operationId)).toBeUndefined();

  const next = conversation();
  const controller = new AbortController();
  const cancelled = fixture(() => {
    controller.abort();
  });
  await expect(
    withSignal(controller.signal, () => cancelled.replies.post(next.caller, input)),
  ).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(opened.store.assistantChat.find(input.operationId)).toBeUndefined();
});

it('does not persist audio after the initiating native job becomes stale during synthesis', async () => {
  const { caller } = conversation();
  let current = true;
  const { replies, files } = fixture(() => {
    current = false;
  });
  const keep = vi.spyOn(files, 'keepBytes');
  const input = { operationId: randomUUID(), text: TEXT };
  const validate = (): void => {
    if (!current) throw new ApiError('forbidden', 'The native job changed');
  };

  await expect(
    withProviderToolAuthority({ validate, hubOsBan: false }, () => replies.post(caller, input)),
  ).rejects.toThrow('The native job changed');
  expect(keep).not.toHaveBeenCalled();
  expect(opened.store.assistantChat.find(input.operationId)).toBeUndefined();
});

it('discards the saved audio if the native job changes while the attachment is being prepared', async () => {
  const { caller } = conversation();
  const { replies, files } = fixture();
  let current = true;
  const keep = files.keepBytes.bind(files);
  const saved: string[] = [];
  vi.spyOn(files, 'keepBytes').mockImplementation(async (input) => {
    const attachment = await keep(input);
    saved.push(attachment.id);
    current = false;
    return attachment;
  });
  const input = { operationId: randomUUID(), text: TEXT };
  const validate = (): void => {
    if (!current) throw new ApiError('forbidden', 'The native job changed');
  };

  await expect(
    withProviderToolAuthority({ validate, hubOsBan: false }, () => replies.post(caller, input)),
  ).rejects.toThrow('The native job changed');
  expect(saved).toHaveLength(1);
  expect(opened.store.assistantChat.findAttachment(saved[0] ?? '')).toBeUndefined();
  expect(opened.store.assistantChat.find(input.operationId)).toBeUndefined();
});

it('exposes only the words to speak and fills the operation identity on the hub', () => {
  expect(mcpToolOperation('chat_speak')).toBe('postChatVoiceReply');
  const { input } = operationShape('postChatVoiceReply');
  expect(input.parse({ text: TEXT })).toEqual({ text: TEXT });
  expect(input.safeParse({ text: TEXT, operationId: randomUUID() }).success).toBe(false);
  expect(input.safeParse({ text: TEXT, chatId: randomUUID() }).success).toBe(false);
});

it('routes a native tool call through the normal operation adapter with an event-bound caller', async () => {
  const { caller, chat } = conversation();
  const { replies, requests } = fixture();
  const { client, authority } = caller;
  if (authority === undefined) throw new Error('Synthetic chat has no turn authority.');
  const operation = API_ENDPOINTS.postChatVoiceReply;
  const invoke = operationRunner('chat_speak', 'postChatVoiceReply');
  const result = await invoke(
    {
      store: opened.store,
      caller: null,
      actor: {
        clientId: client.id,
        profileId: chat.profile_id,
        chatId: chat.id,
        role: 'owner',
        authority,
        callId: randomUUID(),
      },
      operations: {
        run: (name, who, input): Promise<ChatVoiceReceipt> => {
          expect(name).toBe('postChatVoiceReply');
          const body = operation.body.parse(input.body);
          expect(body.operationId).toBeTypeOf('string');
          return replies.post(who, body);
        },
      },
    },
    { text: TEXT },
  );
  const receipt = operation.response.parse(result.structured['result']);
  messageIn(chat, receipt.messageId);
  expect(requests).toHaveLength(1);
});

function personMessage(chat: AiChatRow, text: string): string {
  return new ConversationLog(opened.store).person({
    chat,
    clientId: null,
    author: 'Ann',
    text,
    files: [],
    origin: { source: 'app', plugin_id: null, device_id: null, name: null },
  }).id;
}

it('stores the quoted message with the voice clip and refuses a message from another chat', async () => {
  const { caller, chat } = conversation();
  const { replies, requests } = fixture();
  const asked = personMessage(chat, 'Is  the greenhouse\nready?');
  const other = chatFor(chat.profile_id, {});
  const elsewhere = personMessage(other, 'Not here');
  await expect(replies.post(caller, { text: TEXT, quoteMessageId: elsewhere })).rejects.toThrow(
    'in this chat',
  );
  expect(requests).toEqual([]);
  const result = await replies.post(caller, { text: TEXT, quoteMessageId: asked });
  expect(opened.store.assistantChat.message(result.messageId).quote).toEqual({
    message_id: asked,
    author: 'Ann',
    excerpt: 'Is the greenhouse ready?',
    media_kind: null,
  });
  const plain = await replies.post(caller, { text: 'Done.' });
  expect(opened.store.assistantChat.message(plain.messageId).quote).toBeNull();
});
