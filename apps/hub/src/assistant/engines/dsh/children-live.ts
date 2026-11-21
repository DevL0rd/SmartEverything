import { z } from 'zod';
import type { AiAgentRun, AiChatRow } from '@smarteverything/domain';
import type { HostStore } from '../../../store/host/host-store';
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

function liveRun(store: HostStore, sessionId: string): LiveRun | undefined {
  const run = store.aiAgentRuns.currentOfSession(sessionId);
  if (run?.completed_at !== null || run.child_chat_id === null) return undefined;
  return { run, chatId: run.child_chat_id };
}

export function touchNativeChild(
  store: HostStore,
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

export interface ChildTask {
  readonly chat: AiChatRow;
  readonly author: string;
  readonly hops: number;
  readonly task: string;
}

export async function recordNativeChildTask(
  conversation: ConversationLog,
  child: ChildTask,
): Promise<void> {
  const { chat, author: parentTitle, hops, task } = child;
  const row = await conversation.person({
    chat,
    clientId: null,
    author: parentTitle,
    text: task,
    files: [],
    origin: {
      source: 'chat',
      plugin_id: null,
      device_id: null,
      name: parentTitle,
      hops,
    },
  });
  await conversation.stateOf(row.id, 'delivered');
}

export function nativeChildTask(
  store: HostStore,
  sessionId: string,
  appended: LiveEvents,
): ChildTask | null {
  const live = liveRun(store, sessionId);
  if (live?.run.task !== null) return null;
  const task = taskOf(appended);
  if (task === undefined) return null;
  return {
    chat: store.aiChats.chat(live.chatId),
    author: store.aiChats.chat(live.run.parent_chat_id).title,
    hops: store.assistantEvents.event(live.run.source_id).hops,
    task,
  };
}
