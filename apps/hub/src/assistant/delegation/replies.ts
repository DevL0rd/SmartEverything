import { randomUUID } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import { PLUGIN_ORIGIN, type PluginOrigin } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import { eventAuthority } from '../turn-authority';
import type { ConversationLog } from '../conversation-log';
import { relaySpeaker } from './relay-speaker';

const log = new Logger('hub.assistant-delegation');

export interface Settled {
  readonly state: 'answered' | 'failed' | 'working';
  readonly text: string | null;
}

export interface RepliesDeps {
  readonly store: Store;
  readonly conversation: ConversationLog;
  readonly now: () => Date;
  readonly added: () => void;
}

export class Replies {
  private readonly waiting = new Map<string, (result: Settled) => void>();

  constructor(private readonly deps: RepliesDeps) {}

  wait(eventId: string, from: string | null, target: string, seconds: number): Promise<Settled> {
    return new Promise((settle) => {
      const timer = setTimeout(() => {
        this.waiting.delete(eventId);
        log.info('waiter.timed_out', { eventId, from, target, seconds });
        settle({ state: 'working', text: null });
      }, seconds * 1000);
      this.waiting.set(eventId, (result): void => {
        clearTimeout(timer);
        settle(result);
      });
    });
  }

  finished(event: StoredEvent, text: string, ok: boolean): void {
    const waiter = this.waiting.get(event.id);
    if (waiter !== undefined) {
      if (!this.claim(event, 'waiter')) return;
      this.waiting.delete(event.id);
      waiter({ state: ok ? 'answered' : 'failed', text });
      return;
    }
    this.deps.store.write(() => {
      if (!this.claim(event, 'parent') || event.report_to === null) return;
      this.report(event, text, ok);
    });
  }

  private claim(event: StoredEvent, destination: 'parent' | 'waiter'): boolean {
    const { aiAgentRuns } = this.deps.store;
    const run = aiAgentRuns.find(event.id);
    return run === undefined || aiAgentRuns.claimDelivery(run.id, destination);
  }

  private report(event: StoredEvent, text: string, ok: boolean): void {
    if (event.report_to === null) return;
    const { store, conversation } = this.deps;
    const from = store.aiChats.chat(event.chat_id);
    const target = store.aiChats.chat(event.report_to);
    const hops = event.hops + 1;
    const body = ok ? text : `It could not finish: ${text}`;
    const speaker = relaySpeaker(store, { from, to: target }, hops, this.pluginOf(event));
    const row =
      speaker.helperDialogue === undefined || body.trim() === ''
        ? conversation.note(target, speaker.author, body, speaker.origin)
        : conversation.person({ ...speaker, chat: target, clientId: null, text: body, files: [] });
    const eventId = randomUUID();
    store.assistantEvents.add({
      id: eventId,
      kind: 'report',
      chat_id: target.id,
      message_id: row.id,
      profile_id: target.profile_id,
      client_id: event.client_id,
      text: body,
      hops,
    });
    eventAuthority(
      store,
      store.assistantEvents.event(eventId),
      store.harnessRecovery.latestAuthority(from.id),
    );
    this.deps.added();
  }

  private pluginOf(event: StoredEvent): PluginOrigin | null {
    const origin =
      event.message_id === null
        ? null
        : this.deps.store.assistantChat.message(event.message_id).origin;
    const parsed = PLUGIN_ORIGIN.safeParse({
      plugin_id: origin?.plugin_id,
      requester: origin?.requester,
    });
    return parsed.success ? parsed.data : null;
  }
}
