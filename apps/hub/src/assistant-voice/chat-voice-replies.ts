import { randomUUID } from 'node:crypto';
import {
  ApiError,
  googleModelIdOf,
  type AiChatRow,
  type ChatVoiceReceipt,
  type ChatVoiceReply,
  type MessageQuote,
} from '@smarteverything/domain';
import { switchedOffTools } from '../ai-tools/tool-discovery';
import { ownedChat } from '../assistant/chat-directory';
import { ConversationLog } from '../assistant/conversation-log';
import { quoteForChat } from '../assistant/message-quote';
import { currentProviderToolAuthority } from '../assistant/engines/computer/tool-authority';
import type { AssistantFiles } from '../assistant/files';
import { admitExecutionTool, executionRole, outputAuthority } from '../assistant/turn-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import { currentCentralToolAuthority } from '../harness/central-tool-authority';
import type { Budget } from '../ledger/budget';
import { chatOwnerOf, type Caller } from '../server/auth';
import { effectiveClientById } from '../server/person-access';
import { assertModelAllowed, assertToolArea } from '../server/person-scope';
import { currentRequestSignal } from '../server/request-signal';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { Store } from '../store/store';
import type { AssistantVoice } from './assistant-voice';

const VOICE_TOOL = 'chat_speak';
const VOICE_REPLY_TIMEOUT_MS = 45_000;
const VOICE_ATTACHMENT_NAME = 'Voice reply.wav';
const VOICE_ATTACHMENT_MIME = 'audio/wav';

interface ChatVoiceOptions {
  readonly store: Store;
  readonly files: Pick<AssistantFiles, 'keepBytes' | 'discardCopies'>;
  readonly voice: Pick<AssistantVoice, 'recordClip'>;
  readonly budget: Budget['gate'];
}

interface ReplyScope {
  readonly chat: AiChatRow;
  readonly event: StoredEvent;
  readonly authority: ConversationAuthority;
  readonly authorize: () => void;
}

function replyScope(store: Store, caller: Caller): ReplyScope {
  if (caller.kind === 'anonymous' || caller.authority === undefined)
    throw new ApiError('forbidden', 'Sending a voice reply requires an active AI chat.');
  const { authority } = caller;
  const event = store.assistantEvents.event(authority.event_id);
  const chat = ownedChat(store, chatOwnerOf(store, caller), event.chat_id);
  if (
    chat.id !== caller.chatId ||
    chat.profile_id !== authority.profile_id ||
    event.profile_id !== authority.profile_id
  )
    throw new ApiError('forbidden', 'A voice reply stays in its initiating chat.');
  const outputAllowed = outputAuthority(store, chat.id);
  const provider = currentProviderToolAuthority();
  const central = currentCentralToolAuthority();
  const authorize = (): void => {
    outputAllowed();
    provider?.validate(false);
    central?.authorize(event.id);
    assertToolArea(store, caller, 'assistant');
    admitExecutionTool(store, VOICE_TOOL, authority);
    if (switchedOffTools(store.settings.read().mcp_disabled_tools).has(VOICE_TOOL))
      throw new ApiError('forbidden', 'The home has turned off the voice reply tool.');
    validateInitiator(store, authority);
  };
  authorize();
  return { chat, event, authority, authorize };
}

function validateInitiator(store: Store, authority: ConversationAuthority): void {
  if (authority.client_id === null) return;
  const client = effectiveClientById(store, authority.client_id);
  if (
    store.profiles.activeOf(client.id).id !== authority.profile_id ||
    (executionRole(authority) === 'owner' && client.role !== 'owner')
  )
    throw new ApiError('forbidden', 'The initiating app no longer has its original chat access.');
}

function storedReceipt(
  store: Store,
  scope: ReplyScope,
  operationId: string,
  text: string,
): ChatVoiceReceipt | null {
  const message = store.assistantChat.find(operationId);
  if (message === undefined) return null;
  const [clip] = message.attachments;
  if (
    message.chat_id !== scope.chat.id ||
    message.role !== 'responder' ||
    message.reply_to !== scope.event.message_id ||
    clip?.name !== VOICE_ATTACHMENT_NAME ||
    clip.mime !== VOICE_ATTACHMENT_MIME ||
    clip.transcript !== text
  )
    throw new ApiError('conflict', 'This voice reply ID already belongs to a different message.');
  return { chatId: scope.chat.id, messageId: message.id, attachmentId: clip.id };
}

export class ChatVoiceReplies {
  private readonly running = new Set<string>();

  constructor(private readonly options: ChatVoiceOptions) {}

  async post(caller: Caller, input: ChatVoiceReply): Promise<ChatVoiceReceipt> {
    const scope = replyScope(this.options.store, caller);
    const id = input.operationId ?? randomUUID();
    const receipt = storedReceipt(this.options.store, scope, id, input.text);
    if (receipt !== null) return receipt;
    const quote = quoteForChat(this.options.store, scope.chat, input.quoteMessageId);
    if (this.running.has(id))
      throw new ApiError('conflict', 'This voice reply is already being generated.');
    this.running.add(id);
    try {
      return await this.generate(scope, { id, text: input.text, quote });
    } finally {
      this.running.delete(id);
    }
  }

  private async generate(
    scope: ReplyScope,
    spoken: { readonly id: string; readonly text: string; readonly quote: MessageQuote | null },
  ): Promise<ChatVoiceReceipt> {
    const { id, text, quote } = spoken;
    const { store, voice, budget } = this.options;
    const { chat, event, authority } = scope;
    const timeout = AbortSignal.timeout(VOICE_REPLY_TIMEOUT_MS);
    const request = currentRequestSignal();
    const signal = request === undefined ? timeout : AbortSignal.any([timeout, request]);
    const authorize = (): void => {
      signal.throwIfAborted();
      scope.authorize();
      if (store.assistantEvents.event(event.id).answered_at !== null)
        throw new ApiError('conflict', 'The AI turn ended before the voice reply was ready.');
    };
    authorize();
    const model = store.assistantChat.settings().voice.speech_model;
    assertModelAllowed(store, chat.profile_id, googleModelIdOf(model));
    const background = authority.kind === 'service' || chat.kind === 'subagent';
    budget.check('speak', {
      profileId: chat.profile_id,
      ...(background ? { background: true as const } : {}),
    });
    const clip = await voice.recordClip(
      { id, chatId: chat.id, profileId: chat.profile_id, clientId: authority.client_id, text },
      signal,
    );
    authorize();
    return this.publish(scope, { id, text, quote, clip, signal, authorize });
  }

  private async publish(
    { chat, event }: ReplyScope,
    {
      id,
      text,
      quote,
      clip,
      signal,
      authorize,
    }: {
      readonly id: string;
      readonly text: string;
      readonly quote: MessageQuote | null;
      readonly clip: Awaited<ReturnType<AssistantVoice['recordClip']>>;
      readonly signal: AbortSignal;
      readonly authorize: () => void;
    },
  ): Promise<ChatVoiceReceipt> {
    const { store, files } = this.options;
    const attachment = await files.keepBytes({
      profileId: chat.profile_id,
      name: VOICE_ATTACHMENT_NAME,
      mime: VOICE_ATTACHMENT_MIME,
      content: clip.wav,
      transcript: text,
      signal,
      authorize,
    });
    try {
      authorize();
      const message = new ConversationLog(store).responderInChat({
        chat,
        replyTo: event.message_id,
        messageId: id,
        model: googleModelIdOf(clip.model),
        text: '',
        files: [attachment],
        quote,
      });
      return { chatId: chat.id, messageId: message.id, attachmentId: attachment.id };
    } catch (cause) {
      await files.discardCopies([attachment]);
      throw cause;
    }
  }
}
