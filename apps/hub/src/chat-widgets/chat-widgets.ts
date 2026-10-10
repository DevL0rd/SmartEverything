import {
  chatWidgetsOf,
  newChatWidgets,
  type AssistantMessageRow,
  type ChatWidget,
  type LiveChange,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ToolCallRecord } from '../ai-tools/tool-hub';
import type { McpToolCall } from '../extensions/mcp/call-feed';
import type { Store } from '../store/store';
import type { RuleInput, WidgetFacts } from './rule-input';
import { knownWidget, widgetFactsOf, type WidgetViewer } from './widget-facts';
import { widgetsFor } from './widget-rules';
import type { WorkerChatLink } from './worker-chats';

const RECENT_MESSAGES = 6;

export interface ChatWidgetsDeps {
  readonly store: Store;
  readonly workers: WorkerChatLink;
  readonly now: () => Date;
  readonly log: Logger;
}

interface Attach {
  readonly name: string;
  readonly input: RuleInput;
  readonly chatId: string;
  readonly profileId: string;
}

function insertedMessage(change: LiveChange): AssistantMessageRow | null {
  return change.table === 'assistant_messages' && change.operation === 'INSERT'
    ? change.record
    : null;
}

export class ChatWidgets {
  private readonly pending = new Map<string, ChatWidget[]>();
  private readonly facts: WidgetFacts;

  constructor(private readonly deps: ChatWidgetsDeps) {
    this.facts = widgetFactsOf(deps.store);
  }

  start(): () => void {
    return this.deps.store.feed.subscribe((change) => {
      const row = insertedMessage(change);
      if (row?.role === 'person') {
        this.pending.delete(row.chat_id);
      }
      if (row?.role === 'responder') {
        queueMicrotask(() => {
          this.replied(row);
        });
      }
    });
  }

  called(call: ToolCallRecord): void {
    const { chatId, profileId } = call.caller;
    const { response } = call.result;
    if (chatId !== null && !('error' in response)) {
      this.attach({
        name: call.name,
        input: { args: call.args, output: response },
        chatId,
        profileId,
      });
    }
  }

  mcpCalled(call: McpToolCall): void {
    const chatId = this.deps.workers.chatFor(call);
    if (chatId === null) {
      return;
    }
    const { profile_id: profileId } = this.deps.store.aiChats.chat(chatId);
    this.attach({
      name: call.name,
      input: { args: call.args, output: { result: call.output } },
      chatId,
      profileId,
    });
  }

  private attach({ name, input, chatId, profileId }: Attach): void {
    try {
      const widgets = widgetsFor(name, input, this.facts);
      if (widgets.length > 0) {
        this.show(chatId, profileId, widgets);
      }
    } catch (cause) {
      this.deps.log.error('chat_widgets.attach_failed', cause, { tool: name, chatId });
    }
  }

  private show(chatId: string, profileId: string, widgets: readonly ChatWidget[]): number {
    const viewer = { profileId, now: this.deps.now().getTime() };
    const known = widgets.filter((widget) => this.known(widget, viewer));
    const reply = this.workingReply(chatId);
    return reply === null ? this.hold(chatId, known) : this.add(reply.id, known);
  }

  private known(widget: ChatWidget, viewer: WidgetViewer): boolean {
    const known = knownWidget(this.deps.store, widget, viewer);
    if (!known) {
      this.deps.log.info('chat_widgets.skipped', { kind: widget.kind });
    }
    return known;
  }

  private workingReply(chatId: string): AssistantMessageRow | null {
    return (
      this.deps.store.assistantChat
        .messages({ chatId, limit: RECENT_MESSAGES })
        .find((row) => row.role === 'responder' && row.state === 'working') ?? null
    );
  }

  private hold(chatId: string, widgets: readonly ChatWidget[]): number {
    const held = this.pending.get(chatId) ?? [];
    const fresh = newChatWidgets(held, widgets);
    this.pending.set(chatId, [...held, ...fresh]);
    return fresh.length;
  }

  private add(messageId: string, widgets: readonly ChatWidget[]): number {
    const chat = this.deps.store.assistantChat;
    const row = chat.message(messageId);
    const fresh = newChatWidgets(chatWidgetsOf(row.embeds), widgets);
    if (fresh.length > 0) {
      chat.updateMessage(messageId, { embeds: [...row.embeds, ...fresh] });
    }
    return fresh.length;
  }

  private replied(row: AssistantMessageRow): void {
    const held = this.pending.get(row.chat_id);
    if (held !== undefined) {
      this.pending.delete(row.chat_id);
      this.add(row.id, held);
    }
  }
}
