import { randomUUID } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import {
  ApiError,
  type AiAsk,
  type AiAskResult,
  type AiChatChange,
  type AiChatRow,
  type AiSubagent,
  type AssistantMessageRow,
  type AssistantNewMessage,
  type MessageQuote,
  type PluginOrigin,
} from '@smarteverything/domain';
import type { ToolHub } from '../../ai-tools/tool-hub';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import type { ChatDirectory, ChatOwner } from '../chat-directory';
import type { EngineRegistry } from '../engines/registry';
import type { AssistantFiles } from '../files';
import type { Sender } from '../requests';
import type { ConversationLog, PersonMessage } from '../conversation-log';
import { admitExecutionTarget, currentExecutionAuthority, eventAuthority } from '../turn-authority';
import { HUB_RESTARTED } from '../interruption';
import { admitChatExecution } from '../native-helpers';
import { quoteForChat } from '../message-quote';
import { SubagentAdmission } from './admission';
import { assertChildChange, childTools, selectedHelper } from './child-tools';
import {
  reconcileHelperDialogue,
  sendHelperDialogue,
  settleHelperDialogue,
} from './helper-dialogue';
import { Replies } from './replies';
import { directHelperDialogue, relaySpeaker } from './relay-speaker';
import { RunRows } from '../agent-runs/run-rows';

export const NATIVE_DELEGATION =
  'A native conversation starts helpers with its own subagent tool, not this one.';

export interface DelegationDeps {
  readonly store: Store;
  readonly chats: ChatDirectory;
  readonly conversation: ConversationLog;
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

interface Relay {
  readonly source: AiChatRow | null;
  readonly target: AiChatRow;
  readonly text: string;
  readonly wait: boolean;
  readonly seconds: number;
  readonly quote?: MessageQuote;
}

interface Launch {
  readonly sender: AskSender;
  readonly parent: AiChatRow;
  readonly body: AiSubagent;
  readonly tools: readonly string[];
  readonly hops: number;
}

interface Launched {
  readonly target: AiChatRow;
  readonly eventId: string;
}

const log = new Logger('hub.assistant-delegation');

function titleOf(task: string): string {
  const line = task.trim().split('\n')[0]?.slice(0, 60).trim() ?? '';
  return line === '' ? 'Subagent' : line;
}

export class Delegation {
  private readonly replies: Replies;
  private readonly admission: SubagentAdmission;
  private readonly rows: RunRows;
  private gate: SubagentGate | null = null;

  constructor(private readonly deps: DelegationDeps) {
    this.admission = new SubagentAdmission(deps.store);
    this.rows = new RunRows(deps.store, deps.now);
    this.replies = new Replies(deps);
  }

  attachGate(gate: SubagentGate): void {
    this.gate = gate;
  }

  admit(event: StoredEvent): boolean {
    if (!this.admission.enter(event)) return false;
    this.rows.started(event);
    return true;
  }

  finished(event: StoredEvent, text: string, ok: boolean): void {
    this.rows.finished(event, text, ok);
    this.admission.release(event.id);
    if (!settleHelperDialogue(this.deps, event, text, ok)) this.replies.finished(event, text, ok);
  }

  restart(): void {
    reconcileHelperDialogue(this.deps.store, this.finished.bind(this));
    this.rows.restart();
    for (const event of this.deps.store.assistantEvents.abandoned())
      if (this.deps.store.harnessDeliveries.find(event.id)?.state !== 'admitted')
        settleHelperDialogue(this.deps, event, HUB_RESTARTED, false);
  }

  sendToHelper(
    sender: Sender,
    parent: AiChatRow,
    body: AssistantNewMessage,
    resources: { readonly engines: EngineRegistry; readonly files: AssistantFiles },
  ): Promise<AssistantMessageRow> {
    return sendHelperDialogue(
      {
        ...this.deps,
        ...resources,
        queueRun: (source, target, eventId, text): void => {
          this.gate?.check('subagent');
          this.admission.preflight(source, false);
          this.rows.queued(source, target, eventId, text);
        },
      },
      sender,
      parent,
      body,
    );
  }

  assertChange(chat: AiChatRow, change: AiChatChange): void {
    assertChildChange(this.deps.store, chat, change);
  }

  async ask(sender: AskSender, chatId: string, body: AiAsk): Promise<AiAskResult> {
    const target = this.deps.chats.own(sender.owner, chatId);
    admitChatExecution(target);
    const source = this.sourceOf(sender);
    this.admitTarget(target);
    if (source?.id === target.id)
      throw new ApiError('invalid_request', 'A chat cannot message itself; pick another chat.');
    const quote = quoteForChat(this.deps.store, target, body.quoteMessageId);
    const relay = {
      source,
      target,
      text: body.text,
      wait: body.wait,
      seconds: body.timeoutSeconds,
      ...(quote === null ? {} : { quote }),
    };
    const hops = source === null ? 1 : this.deps.store.assistantEvents.currentHops(source.id) + 1;
    if (target.kind === 'subagent') this.gate?.check('subagent');
    const eventId = this.postRelay(sender, relay, hops);
    log.info('relay.queued', {
      eventId,
      sourceId: source?.id,
      targetId: target.id,
      hops,
      wait: body.wait,
      targetKind: target.kind,
      textChars: body.text.length,
    });
    return await this.settle(relay, eventId, source?.id ?? null);
  }

  async subagent(sender: AskSender, parentId: string, body: AiSubagent): Promise<AiAskResult> {
    if (sender.chatId !== null && sender.chatId !== parentId)
      throw new ApiError(
        'forbidden',
        'A model may launch children only from its actual calling chat.',
      );
    const parent = this.deps.chats.own(sender.owner, parentId);
    admitChatExecution(parent);
    if (parent.engine.kind === 'dsh' && (body.engine === undefined || body.engine.kind === 'dsh'))
      throw new ApiError('conflict', NATIVE_DELEGATION);
    const engine = selectedHelper(this.deps.store, parent, body.engine);
    const hops = this.deps.store.assistantEvents.currentHops(parent.id) + 1;
    this.gate?.check('subagent');
    this.admission.preflight(parent, body.wait);
    const tools = childTools(this.deps.store, parent, body, this.deps.tools?.() ?? null);
    const launched = this.deps.store.write(() =>
      this.start({
        sender,
        parent,
        body: { ...body, ...(engine === undefined ? {} : { engine }) },
        tools,
        hops,
      }),
    );
    log.info('subagent.launched', {
      parentId: parent.id,
      childId: launched.target.id,
      eventId: launched.eventId,
      engine: launched.target.engine.kind,
      hops,
      wait: body.wait,
      taskChars: body.task.length,
    });
    return await this.settle(
      { source: parent, target: launched.target, text: body.task, ...waiting(body) },
      launched.eventId,
      parent.id,
    );
  }

  private start(launch: Launch): Launched {
    const { sender, parent, body, tools, hops } = launch;
    const child = this.deps.chats.create(sender.owner, {
      title: body.title ?? titleOf(body.task),
      engine: body.engine ?? parent.engine,
      parent_id: parent.id,
    });
    const target = this.deps.store.aiChats.update(child.id, { tools: [...tools] });
    const relay = { source: parent, target, text: body.task, ...waiting(body) };
    this.admitTarget(target);
    const eventId = this.post(sender, relay, hops);
    this.rows.queued(parent, target, eventId, body.task);
    return { target, eventId };
  }

  private async settle(relay: Relay, eventId: string, from: string | null): Promise<AiAskResult> {
    const waiter = relay.wait
      ? this.replies.wait(eventId, from, relay.target.id, relay.seconds)
      : null;
    this.deps.added();
    if (waiter === null) return { chatId: relay.target.id, eventId, state: 'queued', text: null };
    return { chatId: relay.target.id, eventId, ...(await waiter) };
  }

  private postRelay(sender: AskSender, relay: Relay, hops: number): string {
    const { target } = relay;
    if (target.kind !== 'subagent' || target.parent_id === null)
      return this.deps.store.write(() => this.post(sender, relay, hops));
    const parent = this.deps.store.aiChats.chat(target.parent_id);
    this.admission.preflight(relay.source ?? parent, relay.wait);
    return this.deps.store.write(() => {
      const eventId = this.post(sender, relay, hops);
      this.projectHelperAsk(sender, relay, hops);
      this.rows.queued(relay.source ?? parent, target, eventId, relay.text);
      return eventId;
    });
  }

  private projectHelperAsk(sender: AskSender, relay: Relay, hops: number): void {
    const { source, target, text } = relay;
    if (source === null) return;
    const helperDialogue = directHelperDialogue(source, target, 'to_helper');
    if (helperDialogue === undefined) return;
    const { author, origin } = relaySpeaker(
      this.deps.store,
      { from: source, to: target },
      hops,
      sender.plugin,
    );
    this.deps.conversation.person({
      chat: source,
      clientId: null,
      author,
      origin,
      text,
      files: [],
      helperDialogue,
      quote: relay.quote ?? null,
    });
  }

  private post(sender: AskSender, relay: Relay, hops: number): string {
    const { store, conversation } = this.deps;
    const speaker =
      relay.source === null
        ? this.serviceSpeaker(sender, hops)
        : relaySpeaker(store, { from: relay.source, to: relay.target }, hops, sender.plugin);
    const row = conversation.person({
      ...speaker,
      chat: relay.target,
      clientId: sender.clientId,
      text: relay.text,
      files: [],
      queued: true,
      quote: relay.quote ?? null,
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
    eventAuthority(store, queued);
    return eventId;
  }

  private serviceSpeaker(
    sender: AskSender,
    hops: number,
  ): Pick<PersonMessage, 'author' | 'origin'> {
    const { store } = this.deps;
    const name = (
      sender.clientId === null ? 'Service' : store.clients.byId(sender.clientId).name
    ).slice(0, 120);
    return {
      author: name,
      origin: {
        source: 'chat',
        plugin_id: null,
        device_id: null,
        name,
        hops,
        ...(sender.plugin ?? {}),
      },
    };
  }

  private admitTarget(target: AiChatRow): void {
    const authority = currentExecutionAuthority();
    if (authority !== undefined) admitExecutionTarget(this.deps.store, target, authority);
  }

  private sourceOf(sender: AskSender): AiChatRow | null {
    return sender.chatId === null ? null : this.deps.chats.own(sender.owner, sender.chatId);
  }
}

function waiting(body: { readonly wait: boolean; readonly timeoutSeconds: number }): {
  readonly wait: boolean;
  readonly seconds: number;
} {
  return { wait: body.wait, seconds: body.timeoutSeconds };
}
