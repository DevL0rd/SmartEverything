import { nativeForkIntent } from '../../harness/forks';
import {
  admitExecutionTarget,
  issueEventAuthority,
  currentExecutionAuthority,
} from '../execution-authority';
import { randomUUID } from 'node:crypto';
import {
  AI_HOPS_MAX,
  ApiError,
  type AiChatChange,
  type AiAsk,
  type AiAskResult,
  type AiChatRow,
  type AiSubagent,
  type MessageOrigin,
  type PluginOrigin,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { ChatDirectory, ChatOwner } from '../chat-directory';
import type { ConversationLog } from '../conversation-log';
import type { StreamEmit } from '../conversation/stream';
import { DEADLOCK_TEXT, PAUSED_TEXT, TOO_MANY_HOPS } from './limits';
import { LoopGuard } from './loop-guard';
import { Reports, originOf, type ReportBack } from './reports';
import { Waiters } from './waiters';
import { SubagentAdmission } from './admission';
import { AgentLifecycle } from './lifecycle';
import { childTools, effectiveTools, assertChildChange } from './grants';
import type { ToolHub } from '../../ai-tools/tool-hub';

export interface CoordinationDeps {
  readonly store: Store;
  readonly chats: ChatDirectory;
  readonly conversation: ConversationLog;
  readonly emit: StreamEmit;
  readonly added: () => void;
  readonly now: () => Date;
  readonly tools?: () => ToolHub | null;
}

export interface SubagentGate {
  readonly check: (work: 'subagent') => void;
}

export interface AskSender {
  readonly owner: ChatOwner;
  readonly clientId: string | null;
  readonly chatId: string | null;
  readonly plugin: PluginOrigin | null;
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
  private readonly admission: SubagentAdmission;
  private readonly lifecycle: AgentLifecycle;
  private gate: SubagentGate | null = null;

  constructor(private readonly deps: CoordinationDeps) {
    this.admission = new SubagentAdmission(deps.store);
    this.lifecycle = new AgentLifecycle(deps.store, deps.now);
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
    this.lifecycle.finished(event, text, ok);
    this.admission.release(event.id);
    this.reports.finished(event, text, ok);
  }

  reportBack(back: ReportBack): void {
    this.reports.report(back);
  }

  async ask(sender: AskSender, chatId: string, body: AiAsk): Promise<AiAskResult> {
    const target = this.deps.chats.own(sender.owner, chatId);
    const source = this.sourceOf(sender);
    this.admitTarget(target);
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

  async subagent(
    sender: AskSender,
    parentId: string,
    body: AiSubagent,
    prepared?: (child: AiChatRow, eventId: string) => void,
  ): Promise<AiAskResult> {
    if (sender.chatId !== null && sender.chatId !== parentId)
      throw new ApiError(
        'forbidden',
        'A model may launch children only from its actual calling chat.',
      );
    const parent = this.deps.chats.own(sender.owner, parentId);
    const hops = this.deps.store.assistantEvents.currentHops(parent.id) + 1;
    if (hops > AI_HOPS_MAX) throw new ApiError('conflict', TOO_MANY_HOPS);
    this.gate?.check('subagent');
    this.admission.preflight(parent, body.wait);
    const tools = childTools(
      { ...parent, tools: inheritedTools(this.deps.store, parent) },
      body,
      this.deps.tools?.() ?? null,
    );
    const accepted = this.writeSubagent(parent, () => {
      const child = this.deps.chats.create(sender.owner, {
        title: body.title ?? titleOf(body.task),
        engine: independentEngine(body.engine ?? parent.engine),
        parent_id: parent.id,
      });
      nativeForkIntent(this.deps.store, parent, child);
      const target = this.deps.store.aiChats.update(child.id, {
        tools,
      });
      const relay = {
        source: parent,
        target,
        text: body.task,
        wait: body.wait,
        seconds: body.timeoutSeconds,
      };
      this.admitTarget(target);
      this.refuse(relay, hops);
      const eventId = this.post(sender, relay, hops);
      this.lifecycle.queued(parent, target, eventId, body.task);
      prepared?.(target, eventId);
      return { target, eventId };
    });
    return this.acceptedChild(parent, accepted, body);
  }
  private async acceptedChild(
    parent: AiChatRow,
    accepted: { readonly target: AiChatRow; readonly eventId: string },
    body: AiSubagent,
  ): Promise<AiAskResult> {
    const waiting = body.wait
      ? this.waiters.wait(accepted.eventId, parent.id, accepted.target.id, body.timeoutSeconds)
      : null;
    this.deps.added();
    return {
      chatId: accepted.target.id,
      eventId: accepted.eventId,
      ...(waiting === null ? { state: 'queued' as const, text: null } : await waiting),
    };
  }
  cancelQueuedChild(eventId: string): boolean {
    const event = this.deps.store.assistantEvents.event(eventId);
    if (event.delivered_at !== null || event.answered_at !== null) return false;
    this.deps.store.durableWrite(() => {
      this.deps.store.assistantEvents.mark(event.id, 'answered_at');
      this.deps.conversation.failedMessage(event.message_id, 'Stopped.', 'interrupted');
      this.finished(event, 'Stopped.', false);
    });
    return true;
  }
  private writeSubagent<T>(parent: AiChatRow, work: () => T): T {
    const write =
      parent.engine.kind === 'dsh' ? this.deps.store.durableWrite : this.deps.store.write;
    return write(work);
  }
  admit(event: StoredEvent): boolean {
    if (!this.admission.enter(event)) return false;
    this.lifecycle.started(event);
    return true;
  }
  restart(): void {
    this.lifecycle.restart();
  }
  assertChange(chat: AiChatRow, change: AiChatChange): void {
    assertChildChange(this.deps.store, chat, change);
  }

  private async relay(sender: AskSender, relay: RelayInput): Promise<AiAskResult> {
    const hops =
      relay.source === null ? 1 : this.deps.store.assistantEvents.currentHops(relay.source.id) + 1;
    this.refuse(relay, hops);
    if (relay.target.kind === 'subagent') {
      this.gate?.check('subagent');
    }
    const eventId = this.postRelay(sender, relay, hops);
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

  private postRelay(sender: AskSender, relay: RelayInput, hops: number): string {
    const target = relay.target;
    if (target.kind !== 'subagent' || target.parent_id === null)
      return this.post(sender, relay, hops);
    const parent = this.deps.store.aiChats.chat(target.parent_id);
    this.admission.preflight(relay.source ?? parent, relay.wait);
    this.assertRelayGrant(relay);
    return this.deps.store.write(() => {
      const eventId = this.post(sender, relay, hops);
      this.lifecycle.queued(relay.source ?? parent, target, eventId, relay.text);
      return eventId;
    });
  }

  private assertRelayGrant(relay: RelayInput): void {
    if (relay.source !== null)
      childTools(
        { ...relay.source, tools: inheritedTools(this.deps.store, relay.source) },
        {
          task: relay.text,
          wait: relay.wait,
          timeoutSeconds: relay.seconds,
          tools: childTools(
            { ...relay.target, tools: inheritedTools(this.deps.store, relay.target) },
            { task: relay.text, wait: false, timeoutSeconds: relay.seconds },
            this.deps.tools?.() ?? null,
          ),
          engine: relay.target.engine,
        },
        this.deps.tools?.() ?? null,
      );
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
    const name = (
      relay.source?.title ??
      (sender.clientId === null ? 'Service' : store.clients.byId(sender.clientId).name)
    ).slice(0, 120);
    const origin: MessageOrigin =
      relay.source === null
        ? { source: 'chat', plugin_id: null, device_id: null, name, hops, ...(sender.plugin ?? {}) }
        : originOf(relay.source, hops, sender.plugin);
    const row = this.deps.conversation.person({
      chat: relay.target,
      clientId: sender.clientId,
      author: name,
      text: relay.text,
      files: [],
      origin,
    });
    const eventId = randomUUID();
    const queued = store.assistantEvents.add({
      id: eventId,
      kind: 'chat',
      chat_id: relay.target.id,
      message_id: row.id,
      profile_id: relay.target.profile_id,
      client_id: sender.clientId,
      text: relay.text,
      report_to: relay.source?.id ?? null,
      hops,
    });
    issueEventAuthority(store, queued, sender.clientId === null);
    return eventId;
  }
  private admitTarget(target: AiChatRow): void {
    const authority = currentExecutionAuthority();
    if (authority !== undefined) admitExecutionTarget(this.deps.store, target, authority);
  }

  private sourceOf(sender: AskSender): AiChatRow | null {
    return sender.chatId === null ? null : this.deps.chats.own(sender.owner, sender.chatId);
  }
}

function inheritedTools(store: Store, parent: AiChatRow): string[] | null {
  const tools = effectiveTools(store, parent);
  return tools === null ? null : [...tools];
}

function independentEngine(engine: AiChatRow['engine']): AiChatRow['engine'] {
  return engine.kind === 'dsh' ? { ...engine, session_id: null } : engine;
}
