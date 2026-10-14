import { stringArgument } from '../ai-tools/arguments';
import type { CallLink } from './call-link';
import type { ConversationHooks } from './conversation-hooks';
import type { LiveSession } from './gemini';
import type { ReplyWatchdog } from './reply-watchdog';
import { failedAnswer } from './tool-answer';
import { deliverToolAnswer, timingOf } from './tool-delivery';
import { trackToolProgress } from './tool-progress';
import type { TurnText } from './turn-text';
import type { TurnTimer } from './turn-timing';
import { VOICE_TOOL_NAMES } from './voice-tools';

export interface VoiceToolPorts {
  readonly hooks: ConversationHooks;
  readonly link: CallLink;
  readonly watchdog: ReplyWatchdog;
  readonly text: TurnText;
  readonly timing: TurnTimer;
  readonly now: () => number;
  readonly session: () => LiveSession | null;
  readonly closed: () => boolean;
  readonly userSpeaking: () => boolean;
  readonly assistantSpeaking: () => boolean;
  readonly flushHeard: () => void;
  readonly finishSoon: () => void;
}

interface TaskCall {
  readonly id: string;
  readonly name: string;
}

export class VoiceTools {
  private readonly tasks = new Map<string, TaskCall>();

  constructor(private readonly ports: VoiceToolPorts) {}

  handle(id: string, name: string, args: Readonly<Record<string, unknown>>): void {
    const { watchdog, session, flushHeard, finishSoon } = this.ports;
    watchdog.replied();
    flushHeard();
    if (
      Object.values(VOICE_TOOL_NAMES).some((control) => control === name) &&
      !this.ports.hooks.tools().some((tool) => tool.name === name)
    ) {
      session()?.toolResult(
        id,
        name,
        { error: `This voice control ${name} is unavailable in this call` },
        { scheduling: 'silent', more: false },
      );
      return;
    }
    if (name === VOICE_TOOL_NAMES.end) {
      session()?.toolResult(id, name, { ok: true }, { scheduling: 'silent', more: false });
      finishSoon();
    } else if (name === VOICE_TOOL_NAMES.task) {
      this.startTask(id, name, stringArgument(args, 'task'));
    } else {
      void this.run(id, name, args);
    }
  }

  taskUpdate(eventId: string, text: string): boolean {
    const { hooks, session, closed } = this.ports;
    const call = this.tasks.get(eventId);
    const live = session();
    if (closed() || call === undefined || live === null) {
      return false;
    }
    const scheduling = timingOf(hooks.settings());
    live.toolResult(call.id, call.name, { update: text }, { scheduling, more: true });
    return true;
  }

  private startTask(id: string, name: string, task: string): void {
    const { hooks, session, text } = this.ports;
    const reply = (response: Readonly<Record<string, unknown>>, more: boolean): void => {
      session()?.toolResult(id, name, response, { scheduling: more ? 'idle' : 'silent', more });
    };
    if (task === '') {
      reply({ error: 'No task was given' }, false);
      return;
    }
    try {
      const eventId = hooks.task(task, text.recentHeard());
      this.tasks.set(eventId, { id, name });
      hooks.record({ who: 'tool', text: 'Handed over a task', ok: true, detail: null });
      reply({ status: 'started; it is running now' }, true);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'That cannot be done from here';
      reply({ error }, false);
    }
  }

  private async run(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const { hooks, link, watchdog, session, closed, timing, now } = this.ports;
    link.state('thinking');
    watchdog.toolStarted();
    const startedAt = now();
    const stopProgress = trackToolProgress(name, { ...this.ports, now });
    const answer = await hooks.run(name, args).catch(failedAnswer);
    stopProgress();
    watchdog.toolFinished();
    timing.tool(name, startedAt);
    if (closed()) {
      return;
    }
    const to = { session: session(), record: hooks.record };
    deliverToolAnswer({ ...to, scheduling: timingOf(hooks.settings()) }, { id, name }, answer);
  }
}
