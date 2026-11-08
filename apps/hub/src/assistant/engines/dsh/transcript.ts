import { nativeInputId } from '@smarteverything/harness/process';
import { z } from 'zod';
import { settledSteps } from '@smarteverything/domain';
import type {
  AiChatRow,
  ChatTimelineEmbed,
  ChatTimelinePart,
  ChatToolItem,
  DshSessionMetadata,
} from '@smarteverything/domain';
import type { Store } from '../../../store/store';
import type { ConversationLog } from '../../conversation-log';
import { nativeRelay } from './native-relay';

interface TranscriptEvent {
  readonly type: string;
  readonly seq: number;
  readonly data: unknown;
}

interface TurnState {
  readonly owned: boolean;
  readonly tools: readonly ChatToolItem[];
  readonly parts: readonly ChatTimelinePart[];
}

interface Folding {
  readonly chat: AiChatRow;
  readonly state: TurnState;
  readonly project: boolean;
}

const TEXT = z.object({ type: z.literal('text'), text: z.string() });
const BLOCK = z.object({ type: z.enum(['text', 'reasoning', 'thinking']), text: z.string() });
const USER = z.object({
  id: z.string().optional(),
});
const ASSISTANT = z.object({
  message: z.object({
    id: z.string(),
    content: z.array(z.unknown()),
    source: z.object({ model: z.string().optional() }).optional(),
  }),
});
const CALL = z.object({ callId: z.string().min(1), name: z.string().min(1) });
const RESULT = z.object({
  message: z.object({ toolCallId: z.string(), isError: z.boolean().optional() }),
});

function textsOf(content: readonly unknown[]): readonly string[] {
  return content.flatMap((block) => {
    const text = TEXT.safeParse(block);
    return text.success ? [text.data.text] : [];
  });
}

function fresh(): TurnState {
  return { owned: false, tools: [], parts: [] };
}

function messageParts(id: string, content: readonly unknown[]): readonly ChatTimelinePart[] {
  return content.flatMap((block, index): readonly ChatTimelinePart[] => {
    const parsed = BLOCK.safeParse(block);
    if (!parsed.success || parsed.data.text.trim() === '') return [];
    const kind = parsed.data.type === 'text' ? 'text' : 'reasoning';
    return [{ kind, key: `${id}:${String(index)}`, text: parsed.data.text }];
  });
}

function timelineOf(parts: readonly ChatTimelinePart[]): ChatTimelineEmbed {
  return { kind: 'chat_timeline', version: 1, parts: [...parts] };
}

export class NativeTranscripts {
  private readonly turns = new Map<string, TurnState>();

  constructor(
    private readonly store: Store,
    private readonly conversation: ConversationLog,
  ) {}

  appended(sessionId: string, events: readonly TranscriptEvent[]): void {
    const owner = this.store.dshSessions.ownerOf(sessionId);
    const first = events[0];
    if (owner === undefined || first === undefined) return;
    const chat = this.store.aiChats.find(owner.chat_id);
    if (chat === undefined) return;
    let state = this.turns.get(sessionId) ?? this.restored(chat, owner, first.seq);
    for (const event of events)
      if (event.seq >= owner.inherited_event_count)
        state = this.fold({ chat, state, project: true }, event);
    this.turns.set(sessionId, state);
  }

  private restored(chat: AiChatRow, owner: DshSessionMetadata, before: number): TurnState {
    const start = owner.inherited_event_count;
    if (before <= start) return fresh();
    const prior = this.store.dshSessions.readAll(owner.header.id, owner.profile_id, {
      offset: start,
      length: before - start,
    });
    return prior.reduce<TurnState>(
      (state, event) => this.fold({ chat, state, project: false }, event),
      fresh(),
    );
  }

  private fold(folding: Folding, event: TranscriptEvent): TurnState {
    const { state } = folding;
    if (event.type === 'turn/start') return fresh();
    if (event.type === 'user/message') return this.user(folding, event.data);
    if (event.type === 'tool/call') return called(state, event.data);
    if (event.type === 'tool/result') return resulted(state, event.data);
    if (event.type === 'assistant/message') return this.reply(folding, event.data);
    return state;
  }

  private user(folding: Folding, data: unknown): TurnState {
    const message = USER.safeParse(data);
    if (!message.success || message.data.id === undefined) return folding.state;
    const id = nativeInputId(data);
    if (id === undefined) return folding.state;
    const state =
      this.store.harnessDeliveries.find(id) === undefined
        ? folding.state
        : { ...folding.state, owned: true };
    const relay = folding.project ? nativeRelay(data) : undefined;
    if (relay !== undefined) this.relayed(folding.chat, relay.id, relay.sender, relay.text);
    return state;
  }

  private relayed(chat: AiChatRow, id: string, senderSessionId: string, text: string): void {
    if (this.store.assistantChat.find(id) !== undefined) return;
    const author = this.senderTitle(senderSessionId);
    const row = this.conversation.person({
      chat,
      clientId: null,
      author,
      text,
      files: [],
      origin: {
        source: 'chat',
        plugin_id: null,
        device_id: null,
        name: author,
        hops: this.store.assistantEvents.currentHops(chat.id),
      },
      messageId: id,
    });
    this.conversation.stateOf(row.id, 'delivered');
  }

  private senderTitle(sessionId: string): string {
    const sender = this.store.dshSessions.ownerOf(sessionId);
    const chat = sender === undefined ? undefined : this.store.aiChats.find(sender.chat_id);
    return chat?.title ?? 'Agent';
  }

  private reply(folding: Folding, data: unknown): TurnState {
    const { state } = folding;
    const message = ASSISTANT.safeParse(data);
    if (state.owned || !message.success) return state;
    const { id, content, source } = message.data.message;
    const parts = [...state.parts, ...messageParts(id, content)];
    const text = textsOf(content).join('');
    if (text.trim() === '') return { ...state, parts };
    if (folding.project && this.store.assistantChat.find(id) === undefined) {
      const row = this.conversation.responderInChat({
        chat: folding.chat,
        replyTo: null,
        text,
        model: source?.model ?? null,
        messageId: id,
        steps: settledSteps(state.tools),
      });
      this.conversation.timeline(row.id, timelineOf(parts));
    }
    return { ...state, tools: [], parts: [] };
  }
}

function called(state: TurnState, data: unknown): TurnState {
  const call = CALL.safeParse(data);
  if (state.owned || !call.success) return state;
  const tool: ChatToolItem = {
    callId: call.data.callId,
    name: call.data.name,
    title: call.data.name,
    state: 'running',
    detail: null,
  };
  const part: ChatTimelinePart = {
    kind: 'tool',
    key: tool.callId,
    tool: { ...tool, input: null, output: null, redacted: false, image_operation_id: null },
  };
  return { ...state, tools: [...state.tools, tool], parts: [...state.parts, part] };
}

function resulted(state: TurnState, data: unknown): TurnState {
  const result = RESULT.safeParse(data);
  if (state.owned || !result.success) return state;
  const { toolCallId, isError } = result.data.message;
  const settled = isError === true ? ('failed' as const) : ('done' as const);
  return {
    ...state,
    tools: state.tools.map((tool) =>
      tool.callId === toolCallId ? { ...tool, state: settled } : tool,
    ),
    parts: state.parts.map((part) =>
      part.kind === 'tool' && part.tool.callId === toolCallId
        ? { ...part, tool: { ...part.tool, state: settled } }
        : part,
    ),
  };
}
