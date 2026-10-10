import { randomUUID } from 'node:crypto';
import {
  AI_HOPS_MAX,
  ApiError,
  DEFAULT_ENGINE,
  type AiAsk,
  type AiAskResult,
  type AiChatRow,
  type AiSubagent,
  type MessageOrigin,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { ChatDirectory, ChatOwner } from '../chat-directory';
import type { ConversationLog } from '../conversation-log';
import type { StreamEmit } from '../engines/openrouter/stream';
import { DEADLOCK_TEXT, PAUSED_TEXT, TOO_MANY_HOPS, WORKER_TEXT } from './limits';
import { LoopGuard } from './loop-guard';
import { askText } from './relay-text';
import { Reports, originOf, type ReportBack } from './reports';
import { Waiters } from './waiters';

export interface CoordinationDeps {
  readonly store: Store;
  readonly chats: ChatDirectory;
  readonly conversation: ConversationLog;
  readonly emit: StreamEmit;
  readonly added: () => void;
  readonly now: () => Date;
}

export interface SubagentGate {
  readonly check: (work: 'subagent') => void;
}

export interface AskSender {
  readonly owner: ChatOwner;
  readonly clientId: string;
  readonly chatId: string | null;
}

interface RelayInput {
  readonly source: AiChatRow | null;
  readonly target: AiChatRow;
  readonly text: string;
  readonly wait: boolean;
  readonly seconds: number;
}

function titleOf(task: string): string {
  const line = task.trim().split('\n')[0]?.slice(0, 60).trim() ?? '';
  return line === '' ? 'Subagent' : line;
}

export class Coordination {
  private readonly waiters = new Waiters();
  private readonly guard: LoopGuard;
  private readonly reports: Reports;
  private gate: SubagentGate | null = null;

  constructor(private readonly deps: CoordinationDeps) {
    this.guard = new LoopGuard(deps.store, deps.conversation, deps.emit, deps.now);
    this.reports = new Reports({
      store: deps.store,
      conversation: deps.conversation,
      guard: this.guard,
      waiters: this.waiters,
      added: deps.added,
    });
  }

  attachGate(gate: SubagentGate): void {
    this.gate = gate;
  }

  finished(event: StoredEvent, text: string, ok: boolean): void {
    this.reports.finished(event, text, ok);
  }

  reportBack(back: ReportBack): void {
    this.reports.report(back);
  }

  async ask(sender: AskSender, chatId: string, body: AiAsk): Promise<AiAskResult> {
    const target = this.deps.chats.own(sender.owner, chatId);
    if (target.kind === 'worker') {
      throw new ApiError('invalid_request', WORKER_TEXT);
    }
    const source = this.sourceOf(sender);
    if (source?.id === target.id) {
      throw new ApiError('invalid_request', 'A chat cannot message itself; pick another chat.');
    }
    return await this.relay(sender, {
      source,
      target,
      text: body.text,
      wait: body.wait,
      seconds: body.timeoutSeconds,
    });
  }

  async subagent(sender: AskSender, parentId: string, body: AiSubagent): Promise<AiAskResult> {
    const parent = this.deps.chats.own(sender.owner, parentId);
    const engine = body.engine ?? DEFAULT_ENGINE;
    if (body.tools !== undefined && engine.kind !== 'openrouter') {
      throw new ApiError('invalid_request', 'A tool list works only for OpenRouter subagents.');
    }
    const child = this.deps.chats.create(sender.owner, {
      title: body.title ?? titleOf(body.task),
      engine,
      parent_id: parent.id,
    });
    const target =
      body.tools === undefined
        ? child
        : this.deps.store.aiChats.update(child.id, { tools: body.tools });
    return await this.relay(sender, {
      source: parent,
      target,
      text: body.task,
      wait: body.wait,
      seconds: body.timeoutSeconds,
    });
  }

  private async relay(sender: AskSender, relay: RelayInput): Promise<AiAskResult> {
    const hops =
      relay.source === null ? 1 : this.deps.store.assistantEvents.currentHops(relay.source.id) + 1;
    this.refuse(relay, hops);
    if (relay.target.kind === 'subagent') {
      this.gate?.check('subagent');
    }
    const eventId = this.post(sender, relay, hops);
    const chatId = relay.target.id;
    const waiting = relay.wait
      ? this.waiters.wait(eventId, relay.source?.id ?? null, chatId, relay.seconds)
      : null;
    this.deps.added();
    if (waiting === null) {
      return { chatId, eventId, state: 'queued', text: null };
    }
    return { chatId, eventId, ...(await waiting) };
  }

  private refuse(relay: RelayInput, hops: number): void {
    if (hops > AI_HOPS_MAX) {
      throw new ApiError('conflict', TOO_MANY_HOPS);
    }
    if (
      relay.wait &&
      relay.source !== null &&
      this.waiters.waitsOn(relay.target.id, relay.source.id)
    ) {
      throw new ApiError('conflict', DEADLOCK_TEXT);
    }
    if (!this.guard.admits(relay.target)) {
      throw new ApiError('conflict', PAUSED_TEXT);
    }
  }

  private post(sender: AskSender, relay: RelayInput, hops: number): string {
    const { store } = this.deps;
    const name = (relay.source?.title ?? store.clients.byId(sender.clientId).name).slice(0, 120);
    const origin: MessageOrigin =
      relay.source === null
        ? { source: 'chat', plugin_id: null, device_id: null, name, hops }
        : originOf(relay.source, hops);
    const row = this.deps.conversation.person({
      chat: relay.target,
      clientId: sender.clientId,
      author: name,
      text: relay.text,
      files: [],
      origin,
    });
    const eventId = randomUUID();
    store.assistantEvents.add({
      id: eventId,
      kind: 'chat',
      chat_id: relay.target.id,
      message_id: row.id,
      profile_id: relay.target.profile_id,
      client_id: sender.clientId,
      text: askText({ eventId, from: name, text: relay.text, answersBack: relay.source !== null }),
      report_to: relay.source?.id ?? null,
      hops,
    });
    return eventId;
  }

  private sourceOf(sender: AskSender): AiChatRow | null {
    return sender.chatId === null ? null : this.deps.chats.own(sender.owner, sender.chatId);
  }
}
