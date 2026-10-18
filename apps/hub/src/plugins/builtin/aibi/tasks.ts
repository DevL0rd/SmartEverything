import { randomUUID } from 'node:crypto';
import type { InboundMessage } from '@smarteverything/domain';
import type { ActivityLog } from './activity';
import { ROBOT_CONVERSATION } from './assistant-commands';
import type { DeskAnswer } from './conversation-types';

export const REPLY_TOOL_NAME = 'reply';

export const TASK_TEXT_MAX = 4000;

const CONVERSATION_TITLE = 'AIBI robot';
const SENDER_NAME = 'AIBI';

export const TELL_NOW =
  '[Tell them about this now, briefly and in your own words, as your own work.]';

const SPOKEN_RULE =
  'Your final answer is spoken out loud by AIBI, a small robot: keep it short, plain and speakable, with no markdown, lists or links. Send working steps only as progress.';

export interface TasksHost {
  readonly post: (message: InboundMessage) => void;
  readonly senderId: () => string;
  readonly activity: ActivityLog;
  readonly tell: (note: string) => 'now' | 'later';
  readonly changed: () => void;
}

export interface TaskResult {
  readonly spoken: 'now' | 'later' | false;
}

function taskMessage(eventId: string, text: string, senderId: string): InboundMessage {
  return {
    eventId,
    conversation: { key: ROBOT_CONVERSATION, title: CONVERSATION_TITLE },
    text: text.slice(0, TASK_TEXT_MAX),
    from: { id: senderId, name: SENDER_NAME, trusted: false },
    attachments: [],
    reply: {
      tool: REPLY_TOOL_NAME,
      eventIdArg: 'eventId',
      textArg: 'text',
      progressArg: 'progress',
      filesArg: null,
    },
    rule: SPOKEN_RULE,
    voice: true,
    priority: 'normal',
  };
}

export class Tasks {
  private readonly open = new Set<string>();
  private readonly running = new Map<string, string>();

  constructor(private readonly host: TasksHost) {}

  get count(): number {
    return this.open.size;
  }

  start(text: string, quick: boolean): DeskAnswer {
    if (text === '') {
      return { result: { error: 'No task was given' } };
    }
    const key = text.toLowerCase();
    if (this.running.has(key)) {
      return { result: { status: 'this task is already running; do not start it again' } };
    }
    const eventId = randomUUID();
    this.host.post(taskMessage(eventId, text, this.host.senderId()));
    this.open.add(eventId);
    this.running.set(key, eventId);
    this.host.activity.add('task', 'Handed to the assistant', text);
    this.host.changed();
    return {
      spoken: true,
      holds: quick,
      result: {
        status:
          'started and running in the background; tell them now, in a few words, that you are on it',
      },
      line: 'Handed over a task.',
    };
  }

  result(eventId: string, content: string, quiet: boolean): TaskResult {
    if (quiet) {
      if (this.open.has(eventId)) {
        this.host.activity.add('task', 'Progress', content);
      }
      return { spoken: false };
    }
    this.open.delete(eventId);
    for (const [task, id] of this.running) {
      if (id === eventId) {
        this.running.delete(task);
      }
    }
    this.host.activity.add('task', 'Result', content);
    const spoken = this.host.tell(`[Task update] ${content.slice(0, TASK_TEXT_MAX)}\n${TELL_NOW}`);
    this.host.changed();
    return { spoken };
  }
}
