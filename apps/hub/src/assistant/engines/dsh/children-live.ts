import { z } from 'zod';
import type { AiAgentRun, AiChatRow } from '@smarteverything/domain';
import type { Store } from '../../../store/store';
import type { ConversationLog } from '../../conversation-log';

interface LiveEvent {
  readonly type: string;
  readonly time: number;
  readonly data: unknown;
}

type LiveEvents = readonly LiveEvent[];

const ACTIVITY_TYPES: ReadonlySet<string> = new Set([
  'assistant/message',
  'tool/call',
  'tool/result',
]);
const TEXT = z.object({ type: z.literal('text'), text: z.string() });
const USER = z.object({ content: z.array(z.unknown()) });

function textOf(content: readonly unknown[]): string {
  return content
    .flatMap((block) => {
      const text = TEXT.safeParse(block);
      return text.success ? [text.data.text] : [];
    })
    .join('');
}

function latestActivity(events: LiveEvents): number | undefined {
  const times = events.filter((event) => ACTIVITY_TYPES.has(event.type)).map((event) => event.time);
  return times.length === 0 ? undefined : Math.max(...times);
}

interface LiveRun {
  readonly run: AiAgentRun;
  readonly chatId: string;
}

function liveRun(store: Store, sessionId: string): LiveRun | undefined {
  const run = store.aiAgentRuns.currentOfSession(sessionId);
  if (run?.completed_at !== null || run.child_chat_id === null) return undefined;
  return { run, chatId: run.child_chat_id };
}

export function touchNativeChild(
  store: Store,
  sessionId: string,
  appended: LiveEvents,
): AiAgentRun | undefined {
  const live = liveRun(store, sessionId);
  if (live === undefined) return undefined;
  const { run } = live;
  const activity = latestActivity(appended);
  if (activity === undefined) return undefined;
  return store.aiAgentRuns.upsert({
    ...run,
    updated_at: new Date(activity).toISOString(),
    source_seq: run.source_seq + 1,
  });
}

function taskOf(events: LiveEvents): string | undefined {
  for (const event of events) {
    if (event.type !== 'user/message') continue;
    const message = USER.safeParse(event.data);
    const text = message.success ? textOf(message.data.content) : '';
    if (text !== '') return text;
  }
  return undefined;
}

function recordTask(
  ports: { readonly store: Store; readonly conversation: ConversationLog },
  chat: AiChatRow,
  run: AiAgentRun,
  task: string,
): void {
  const { store, conversation } = ports;
  const parent = store.aiChats.chat(run.parent_chat_id);
  const row = conversation.person({
    chat,
    clientId: null,
    author: parent.title,
    text: task,
    files: [],
    origin: {
      source: 'chat',
      plugin_id: null,
      device_id: null,
      name: parent.title,
      hops: store.assistantEvents.event(run.source_id).hops,
    },
  });
  conversation.stateOf(row.id, 'delivered');
}

export function projectNativeChildTask(
  ports: { readonly store: Store; readonly conversation: ConversationLog },
  sessionId: string,
  appended: LiveEvents,
): void {
  const live = liveRun(ports.store, sessionId);
  if (live?.run.task !== null) return;
  const task = taskOf(appended);
  if (task !== undefined) recordTask(ports, ports.store.aiChats.chat(live.chatId), live.run, task);
}
