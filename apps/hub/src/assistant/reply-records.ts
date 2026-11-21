import {
  ASSISTANT_STEPS_KEPT,
  CHAT_TODOS_KIND,
  WEB_SOURCES_EMBED,
  WEB_SOURCES_KIND,
  assistantLabel,
  type AiChatRow,
  type AssistantMessageRow,
  type AssistantReasonCode,
  type AssistantRequestState,
  type ChatStepOutcome,
  type ChatTimelineEmbed,
  type ChatTodosEmbed,
  type SettledStep,
  type WebSource,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { NewAssistantMessage } from '../store/repositories/assistant-chat';
import type { Store } from '../store/store';

const log = new Logger('hub.assistant-conversation');

function activityLine(label: string): string {
  return label.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function keptSteps(steps: readonly SettledStep[]): {
  readonly steps: string[];
  readonly step_states: ChatStepOutcome[];
} {
  const kept = steps
    .map((step) => ({ title: activityLine(step.title), outcome: step.outcome }))
    .filter((step) => step.title !== '')
    .slice(-ASSISTANT_STEPS_KEPT);
  return { steps: kept.map((step) => step.title), step_states: kept.map((step) => step.outcome) };
}

export interface ReplyStart {
  readonly chat: AiChatRow;
  readonly replyTo: string | null;
  readonly model: string;
}

export function startedReply(store: Store, start: ReplyStart): NewAssistantMessage {
  return {
    origin: null,
    embeds: [],
    cost_micros: 0,
    quote: null,
    profile_id: start.chat.profile_id,
    client_id: null,
    chat_id: start.chat.id,
    role: 'responder',
    kind: 'text',
    author: assistantLabel(store.assistantChat.settings()),
    text: '',
    attachments: [],
    state: 'working',
    reason: null,
    steps: [],
    step_states: [],
    reply_to: start.replyTo,
    model: start.model,
  };
}

export interface ReplyDone {
  readonly model: string;
  readonly steps: readonly SettledStep[];
  readonly sources: readonly WebSource[];
}

export interface ReplyFailure {
  readonly text: string;
  readonly reason: string;
  readonly code: AssistantReasonCode;
}

export type ReplyOp =
  | { readonly kind: 'text'; readonly id: string; readonly text: string }
  | { readonly kind: 'timeline'; readonly id: string; readonly timeline: ChatTimelineEmbed }
  | {
      readonly kind: 'progress';
      readonly id: string;
      readonly text: string;
      readonly timeline: ChatTimelineEmbed;
    }
  | { readonly kind: 'todos'; readonly id: string; readonly todos: ChatTodosEmbed }
  | {
      readonly kind: 'finish';
      readonly id: string;
      readonly text: string;
      readonly done: ReplyDone;
    }
  | {
      readonly kind: 'fail';
      readonly id: string;
      readonly failure: ReplyFailure;
      readonly steps: readonly SettledStep[];
    }
  | {
      readonly kind: 'state';
      readonly messageId: string | null;
      readonly state: AssistantRequestState;
      readonly reason: string | null;
    }
  | {
      readonly kind: 'failedMessage';
      readonly messageId: string | null;
      readonly reason: string;
      readonly code: AssistantReasonCode;
    }
  | { readonly kind: 'delivered'; readonly eventId: string }
  | {
      readonly kind: 'failedEvent';
      readonly eventId: string;
      readonly messageId: string | null;
      readonly reason: string;
      readonly code: AssistantReasonCode;
    }
  | { readonly kind: 'interrupted'; readonly reason: string };

export function savedSources(store: Store, id: string): readonly WebSource[] {
  return store.assistantChat.message(id).embeds.flatMap((embed) => {
    const parsed = WEB_SOURCES_EMBED.safeParse(embed);
    return parsed.success ? parsed.data.sources : [];
  });
}

function withTimeline(
  store: Store,
  id: string,
  timeline: ChatTimelineEmbed,
): AssistantMessageRow['embeds'] {
  const kept = store.assistantChat
    .message(id)
    .embeds.filter((embed) => embed.kind !== 'chat_timeline');
  return [...kept, timeline];
}

function finish(store: Store, id: string, text: string, done: ReplyDone): AssistantMessageRow {
  const kept = store.assistantChat
    .message(id)
    .embeds.filter((embed) => embed.kind !== WEB_SOURCES_KIND);
  log.debug('reply.finished', {
    messageId: id,
    model: done.model,
    textChars: text.length,
    steps: done.steps.length,
    sources: done.sources.length,
  });
  return store.assistantChat.updateMessage(id, {
    embeds:
      done.sources.length === 0
        ? kept
        : [...kept, { kind: WEB_SOURCES_KIND, sources: done.sources }],
    text,
    model: done.model,
    state: 'answered',
    ...keptSteps(done.steps),
  });
}

function fail(
  store: Store,
  id: string,
  failure: ReplyFailure,
  steps: readonly SettledStep[],
): void {
  log.warn('reply.failed', {
    messageId: id,
    reasonCode: failure.code,
    reason: failure.reason.slice(0, 200),
    textChars: failure.text.length,
    steps: steps.length,
  });
  store.assistantChat.updateMessage(id, {
    text: failure.text,
    state: 'failed',
    reason: failure.reason.slice(0, 400),
    reason_code: failure.code,
    ...keptSteps(steps),
  });
}

function messageOf(store: Store, id: string | null): AssistantMessageRow | null {
  return id === null ? null : (store.assistantChat.find(id) ?? null);
}

function stateOf(
  store: Store,
  messageId: string | null,
  state: AssistantRequestState,
  reason: string | null,
): void {
  const message = messageOf(store, messageId);
  if (message === null || message.state === state || message.state === 'failed') {
    log.trace('message.state_unchanged', { messageId, state, current: message?.state });
    return;
  }
  log.debug('message.state_changed', {
    messageId: message.id,
    chatId: message.chat_id,
    from: message.state,
    to: state,
    hasReason: reason !== null,
  });
  store.assistantChat.updateMessage(message.id, { state, reason });
}

function failedMessage(
  store: Store,
  messageId: string | null,
  reason: string,
  code: AssistantReasonCode,
): void {
  const message = messageOf(store, messageId);
  if (message === null) return;
  log.warn('message.failed', {
    messageId: message.id,
    chatId: message.chat_id,
    from: message.state,
    reasonCode: code,
    reason: reason.slice(0, 200),
  });
  store.assistantChat.updateMessage(message.id, {
    state: 'failed',
    reason: reason.slice(0, 400),
    reason_code: code,
  });
}

function delivered(store: Store, eventId: string): void {
  const message = messageOf(store, store.assistantEvents.event(eventId).message_id);
  if (message?.state === 'queued')
    store.assistantChat.updateMessage(message.id, { state: 'delivered' });
}

function failedEvent(store: Store, op: Extract<ReplyOp, { kind: 'failedEvent' }>): void {
  store.aiRepairInbox.markFailed(op.eventId);
  const text = op.code === 'unknown' ? `Assistant unavailable: ${op.reason}` : op.reason;
  failedMessage(store, op.messageId, text, op.code);
}

function interrupted(store: Store, reason: string): void {
  log.info('turns.interrupted', { reason: reason.slice(0, 200) });
  store.assistantChat.failWorking(reason, 'interrupted');
  for (const event of store.assistantEvents.abandoned()) {
    store.assistantEvents.mark(event.id, 'answered_at');
    store.aiRepairInbox.markFailed(event.id);
    if (messageOf(store, event.message_id)?.role === 'person')
      failedMessage(store, event.message_id, reason, 'interrupted');
  }
}

type ReplyRowOp = Extract<ReplyOp, { readonly id: string }>;

function isReplyRowOp(op: ReplyOp): op is ReplyRowOp {
  return 'id' in op;
}

function applyReplyRowOp(store: Store, op: ReplyRowOp): AssistantMessageRow | null {
  switch (op.kind) {
    case 'text':
      store.assistantChat.updateMessage(op.id, { text: op.text });
      return null;
    case 'timeline':
      store.assistantChat.updateMessage(op.id, {
        embeds: withTimeline(store, op.id, op.timeline),
      });
      return null;
    case 'progress':
      store.assistantChat.updateMessage(op.id, {
        text: op.text,
        embeds: withTimeline(store, op.id, op.timeline),
      });
      return null;
    case 'todos': {
      const kept = store.assistantChat
        .message(op.id)
        .embeds.filter((embed) => embed.kind !== CHAT_TODOS_KIND);
      store.assistantChat.updateMessage(op.id, { embeds: [...kept, op.todos] });
      return null;
    }
    case 'finish':
      return finish(store, op.id, op.text, op.done);
    case 'fail':
      fail(store, op.id, op.failure, op.steps);
      return null;
  }
}

function applyMessageOp(store: Store, op: Exclude<ReplyOp, ReplyRowOp>): void {
  switch (op.kind) {
    case 'state':
      stateOf(store, op.messageId, op.state, op.reason);
      return;
    case 'failedMessage':
      failedMessage(store, op.messageId, op.reason, op.code);
      return;
    case 'delivered':
      delivered(store, op.eventId);
      return;
    case 'failedEvent':
      failedEvent(store, op);
      return;
    case 'interrupted':
      interrupted(store, op.reason);
      return;
  }
}

export function applyReplyOp(store: Store, op: ReplyOp): AssistantMessageRow | null {
  if (isReplyRowOp(op)) return applyReplyRowOp(store, op);
  applyMessageOp(store, op);
  return null;
}
