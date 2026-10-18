import { Logger, background, messageOf } from '@smarteverything/logging';
import { stringArgument } from '../ai-tools/arguments';
import type { CallLink } from './call-link';
import type { RecordedTurn } from './call-record';
import type { ConversationHooks } from './conversation-hooks';
import type { LiveSession } from './gemini';
import type { LiveRenewal } from './live-renewal';
import type { ReplyWatchdog } from './reply-watchdog';
import { failedAnswer, type ToolAnswer } from './tool-answer';
import { deliverLateAnswer, deliverToolAnswer, timingOf, type ToolCallRef } from './tool-delivery';
import { trackToolProgress } from './tool-progress';
import type { TurnText } from './turn-text';
import type { TurnTimer } from './turn-timing';
import { VOICE_TOOL_NAMES } from './voice-tools';

const log = new Logger('hub.voice-tools');

export interface VoiceToolPorts {
  readonly hooks: ConversationHooks;
  readonly record: (turn: RecordedTurn) => void;
  readonly renewal: LiveRenewal;
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
  readonly session: LiveSession | null;
}

export class VoiceTools {
  private readonly tasks = new Map<string, TaskCall>();

  constructor(private readonly ports: VoiceToolPorts) {}

  handle(id: string, name: string, args: Readonly<Record<string, unknown>>): void {
    const { session, flushHeard, finishSoon } = this.ports;
    flushHeard();
    const callId = this.ports.hooks.callId?.();
    log.debug('tool.requested', () => ({
      callId,
      tool: name,
      toolCallId: id,
      argumentKeys: Object.keys(args).length,
    }));
    if (
      Object.values(VOICE_TOOL_NAMES).some((control) => control === name) &&
      !this.ports.hooks.tools().some((tool) => tool.name === name)
    ) {
      log.warn('tool.control_unavailable', { callId, tool: name });
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
      background(this.run(id, name, args), 'conversation_tools.run_failed');
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
    if (live === call.session) {
      live.toolResult(call.id, call.name, { update: text }, { scheduling, more: true });
    } else {
      live.text(`[Task update] ${text}`, true);
      this.ports.watchdog.asked(this.ports.now());
    }
    return true;
  }

  private startTask(id: string, name: string, task: string): void {
    const { hooks, session, text, record } = this.ports;
    const reply = (response: Readonly<Record<string, unknown>>, more: boolean): void => {
      session()?.toolResult(id, name, response, { scheduling: more ? 'idle' : 'silent', more });
    };
    if (task === '') {
      reply({ error: 'No task was given' }, false);
      return;
    }
    try {
      const eventId = hooks.task(task, text.recentHeard());
      this.tasks.set(eventId, { id, name, session: session() });
      log.info('task.handed_over', { callId: hooks.callId?.(), eventId, taskChars: task.length });
      record({ who: 'tool', text: 'Handed over a task', ok: true, detail: null });
      reply({ status: 'started; it is running now' }, true);
    } catch (cause) {
      log.warn('task.refused', {
        callId: hooks.callId?.(),
        cause: cause instanceof Error ? cause.name : typeof cause,
      });
      const error = messageOf(cause);
      reply({ error }, false);
    }
  }

  private async run(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const { hooks, link, watchdog, session, closed, timing, now } = this.ports;
    const asked = session();
    link.state('thinking');
    watchdog.toolStarted();
    const startedAt = now();
    const stopProgress = trackToolProgress(name, { ...this.ports, now });
    const answer = await hooks.run(name, args).catch(failedAnswer);
    stopProgress();
    watchdog.toolFinished();
    timing.tool(name, startedAt);
    log.debug('tool.answered', () => ({
      callId: hooks.callId?.(),
      tool: name,
      toolCallId: id,
      failed: 'error' in answer.response,
      pictures: answer.pictures.length,
      callClosed: closed(),
      durationMs: now() - startedAt,
    }));
    if (closed()) {
      return;
    }
    this.deliver(asked, { id, name }, answer);
  }

  private deliver(asked: LiveSession | null, call: ToolCallRef, answer: ToolAnswer): void {
    const { hooks, session, record, renewal, watchdog, now } = this.ports;
    const live = session();
    const to = { session: live, record, scheduling: timingOf(hooks.settings()) };
    if (live === asked) {
      deliverToolAnswer(to, call, answer);
    } else {
      deliverLateAnswer(to, call, answer);
    }
    renewal.delivered(call.name, answer);
    watchdog.asked(now());
  }
}
