import { randomUUID } from 'node:crypto';
import { Logger, background } from '@smarteverything/logging';
import {
  ApiError,
  assistantLabel,
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
import { admitExecutionTarget, authorityScope, currentExecutionAuthority } from '../turn-authority';
import { HUB_RESTARTED } from '../interruption';
import { admitChatExecution } from '../native-helpers';
import { SubagentAdmission } from './admission';
import { assertChildChange, childTools, selectedHelper } from './child-tools';
import {
  reconcileHelperDialogue,
  sendHelperDialogue,
  settleHelperDialogue,
} from './helper-dialogue';
import { Replies } from './replies';
import { directHelperDialogue, relayAuthor, relaySpeaker } from './relay-speaker';
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
  private readonly settling = new Set<Promise<void>>();
  private gate: SubagentGate | null = null;

  constructor(private readonly deps: DelegationDeps) {
    this.admission = new SubagentAdmission(deps.store);
    this.rows = new RunRows(deps.store, deps.now);
    this.replies = new Replies(deps);
  }

  attachGate(gate: SubagentGate): void {
    this.gate = gate;
  }

  async admit(event: StoredEvent): Promise<boolean> {
    if (!(await this.admission.enter(event))) return false;
    await this.rows.started(event);
    return true;
  }

  ended(event: StoredEvent, text: string, ok: boolean): void {
    background(this.finished(event, text, ok), 'delegation.finish_failed', { eventId: event.id });
  }

  async finished(event: StoredEvent, text: string, ok: boolean): Promise<void> {
    this.admission.release(event.id);
    await this.rows.finished(event, text, ok);
    if (!this.settleDialogue(event, text, ok)) await this.replies.finished(event, text, ok);
  }

  async restart(): Promise<void> {
    const { host } = this.deps.store;
    await reconcileHelperDialogue(this.deps.store, this.finished.bind(this));
    await this.rows.restart();
    for (const event of await host.call('assistantEvents', 'abandoned'))
      if ((await host.call('harnessDeliveries', 'find', event.id))?.state !== 'admitted')
        this.settleDialogue(event, HUB_RESTARTED, false);
  }

  async settled(): Promise<void> {
    while (this.settling.size > 0) await Promise.allSettled([...this.settling]);
  }

  private settleDialogue(event: StoredEvent, text: string, ok: boolean): boolean {
    const settling = settleHelperDialogue(this.deps, event, text, ok);
    if (settling === null) return false;
    const tracked = settling.finally(() => {
      this.settling.delete(tracked);
    });
    this.settling.add(tracked);
    background(tracked, 'helper.settle_failed', { eventId: event.id });
    return true;
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
        queueRun: async (source): Promise<void> => {
          this.gate?.check('subagent');
          await this.admission.preflight(source, false);
        },
      },
      sender,
      parent,
      body,
    );
  }

  assertChange(chat: AiChatRow, change: AiChatChange): Promise<void> {
    return assertChildChange(this.deps.store, chat, change);
  }

  async ask(sender: AskSender, chatId: string, body: AiAsk): Promise<AiAskResult> {
    const { store } = this.deps;
    const target = await this.deps.chats.own(sender.owner, chatId);
    admitChatExecution(target);
    const source = await this.sourceOf(sender);
    this.admitTarget(target);
    if (source?.id === target.id)
      throw new ApiError('invalid_request', 'A chat cannot message itself; pick another chat.');
    const quote = await store.host.read('assistantQuote', {
      chat: target,
      id: body.quoteMessageId,
    });
    const relay = {
      source,
      target,
      text: body.text,
      wait: body.wait,
      seconds: body.timeoutSeconds,
      ...(quote === null ? {} : { quote }),
    };
    const hops =
      source === null
        ? 1
        : (await store.host.call('assistantEvents', 'currentHops', source.id)) + 1;
    if (target.kind === 'subagent') this.gate?.check('subagent');
    const eventId = await this.postRelay(sender, relay, hops);
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
    const { store } = this.deps;
    const parent = await this.deps.chats.own(sender.owner, parentId);
    admitChatExecution(parent);
    if (parent.engine.kind === 'dsh' && (body.engine === undefined || body.engine.kind === 'dsh'))
      throw new ApiError('conflict', NATIVE_DELEGATION);
    const engine = selectedHelper(store, parent, body.engine);
    const hops = (await store.host.call('assistantEvents', 'currentHops', parent.id)) + 1;
    this.gate?.check('subagent');
    await this.admission.preflight(parent, body.wait);
    const tools = await childTools(store, parent, body, this.deps.tools?.() ?? null);
    const launched = await this.start({
      sender,
      parent,
      body: { ...body, ...(engine === undefined ? {} : { engine }) },
      tools,
      hops,
    });
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

  private async start(launch: Launch): Promise<Launched> {
    const { sender, parent, body, tools, hops } = launch;
    const { store } = this.deps;
    const child = await this.deps.chats.prepare(sender.owner, {
      title: body.title ?? titleOf(body.task),
      engine: body.engine ?? parent.engine,
      parent_id: parent.id,
    });
    this.admitTarget({ profile_id: child.profileId, engine: child.engine });
    const eventId = randomUUID();
    const target = await store.host.write('assistantSubagentStart', {
      eventId,
      speaker: relayAuthor(this.assistantName(), parent, hops, sender.plugin),
      source: parent,
      clientId: sender.clientId,
      text: body.task,
      quote: null,
      hops,
      child,
      tools,
      parent,
      now: this.deps.now().toISOString(),
      held: store.live.chatWork.holds.held(),
      scope: authorityScope(),
    });
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

  private async postRelay(sender: AskSender, relay: Relay, hops: number): Promise<string> {
    const { store } = this.deps;
    const { target } = relay;
    const eventId = randomUUID();
    const post = {
      eventId,
      speaker: await this.relayedSpeaker(sender, relay, hops),
      target,
      source: relay.source,
      clientId: sender.clientId,
      text: relay.text,
      quote: relay.quote ?? null,
      hops,
      held: store.live.chatWork.holds.held(),
      scope: authorityScope(),
    };
    if (target.kind !== 'subagent' || target.parent_id === null) {
      await store.host.write('assistantRelayPost', { ...post, mirror: null, run: null });
      return eventId;
    }
    const parent = await store.host.call('aiChats', 'chat', target.parent_id);
    await this.admission.preflight(relay.source ?? parent, relay.wait);
    await store.host.write('assistantRelayPost', {
      ...post,
      mirror: this.helperAsk(sender, relay, hops),
      run: { parent: relay.source ?? parent, now: this.deps.now().toISOString() },
    });
    return eventId;
  }

  private helperAsk(sender: AskSender, relay: Relay, hops: number): PersonMessage | null {
    const { source, target, text } = relay;
    if (source === null) return null;
    const helperDialogue = directHelperDialogue(source, target, 'to_helper');
    if (helperDialogue === undefined) return null;
    const { author, origin } = relaySpeaker(
      this.assistantName(),
      { from: source, to: target },
      hops,
      sender.plugin,
    );
    return {
      chat: source,
      clientId: null,
      author,
      origin,
      text,
      files: [],
      helperDialogue,
      quote: relay.quote ?? null,
    };
  }

  private assistantName(): string {
    return assistantLabel(this.deps.store.live.home.assistant.read());
  }

  private async relayedSpeaker(
    sender: AskSender,
    relay: Relay,
    hops: number,
  ): Promise<Pick<PersonMessage, 'author' | 'origin' | 'helperDialogue'>> {
    return relay.source === null
      ? await this.serviceSpeaker(sender, hops)
      : relaySpeaker(
          this.assistantName(),
          { from: relay.source, to: relay.target },
          hops,
          sender.plugin,
        );
  }

  private async serviceSpeaker(
    sender: AskSender,
    hops: number,
  ): Promise<Pick<PersonMessage, 'author' | 'origin'>> {
    const { store } = this.deps;
    const name = (
      sender.clientId === null
        ? 'Service'
        : (await store.host.call('clients', 'byId', sender.clientId)).name
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

  private admitTarget(target: Pick<AiChatRow, 'profile_id' | 'engine'>): void {
    const authority = currentExecutionAuthority();
    if (authority !== undefined) admitExecutionTarget(this.deps.store, target, authority);
  }

  private async sourceOf(sender: AskSender): Promise<AiChatRow | null> {
    return sender.chatId === null ? null : await this.deps.chats.own(sender.owner, sender.chatId);
  }
}

function waiting(body: { readonly wait: boolean; readonly timeoutSeconds: number }): {
  readonly wait: boolean;
  readonly seconds: number;
} {
  return { wait: body.wait, seconds: body.timeoutSeconds };
}
