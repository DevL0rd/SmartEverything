import type { FunctionDeclaration } from '@google/genai';
import { background, messageOf } from '@smarteverything/logging';
import { stringArgument } from '../ai-tools/arguments';
import type { ToolCaller } from '../ai-tools/hub-tool';
import { limitsOf } from '../ai-tools/plugin-turn';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { RecordedTurn } from './call-record';
import type { LiveSession } from './gemini';
import type { LiveRenewal } from './live-renewal';
import type { ReplyWatchdog } from './reply-watchdog';
import { failedAnswer, type ToolAnswer } from './tool-answer';
import { deliverLateAnswer, deliverToolAnswer, timingOf, type ToolCallRef } from './tool-delivery';
import { trackToolProgress } from './tool-progress';
import type { TurnTool } from './turn-session';
import type { TurnSessionTrace } from './turn-session-trace';
import type { TurnText } from './turn-text';
import { declarationOf, stringsOf } from './turn-tool';
import { voiceResponseOf } from './voice-results';
import { voiceArgumentsOf } from './voice-shapes';
import { VOICE_TOOL_NAMES } from './voice-tools';
import type { VoiceKit, VoiceWho } from './voice-kit';

export interface TurnToolPorts {
  readonly kit: VoiceKit;
  readonly who: VoiceWho;
  readonly hub: ToolHub;
  readonly tools: readonly TurnTool[];
  readonly bare: boolean;
  readonly assistantTools: () => readonly FunctionDeclaration[];
  readonly messageId: string;
  readonly trace: TurnSessionTrace;
  readonly renewal: LiveRenewal;
  readonly watchdog: ReplyWatchdog;
  readonly text: TurnText;
  readonly record: (turn: RecordedTurn) => void;
  readonly now: () => number;
  readonly session: () => LiveSession | null;
  readonly closed: () => boolean;
  readonly userSpeaking: () => boolean;
  readonly assistantSpeaking: () => boolean;
}

interface TaskCall extends ToolCallRef {
  readonly session: LiveSession | null;
}

export class TurnTools {
  private readonly tasks = new Map<string, TaskCall>();

  constructor(private readonly ports: TurnToolPorts) {}

  declarations(): FunctionDeclaration[] {
    return this.ports.tools.map(declarationOf);
  }

  handle(id: string, name: string, args: Readonly<Record<string, unknown>>): void {
    background(this.call(id, name, args), 'turn_session.tool_failed');
  }

  taskUpdate(eventId: string, text: string): boolean {
    const { kit, session, closed, watchdog, now } = this.ports;
    const call = this.tasks.get(eventId);
    const live = session();
    if (closed() || call === undefined || live === null) {
      return false;
    }
    if (live === call.session) {
      const scheduling = timingOf(kit.store.assistantChat.settings().voice);
      live.toolResult(call.id, call.name, { update: text }, { scheduling, more: true });
    } else {
      live.text(`[Task update] ${text}`, true);
      watchdog.asked(now());
    }
    return true;
  }

  private async call(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const own = this.ports.tools.find((tool) => tool.name === name);
    if (own === undefined && name === VOICE_TOOL_NAMES.task) {
      this.task(id, name, args);
      return;
    }
    const { trace, watchdog, session, closed, now } = this.ports;
    const asked = session();
    const startedAt = performance.now();
    trace.toolCalled(name, id, own !== undefined, Object.keys(args).length);
    watchdog.toolStarted();
    const stopProgress = trackToolProgress(name, {
      session,
      closed,
      userSpeaking: this.ports.userSpeaking,
      assistantSpeaking: this.ports.assistantSpeaking,
      now,
    });
    const answer = await this.answer(name, args, own).catch(failedAnswer);
    stopProgress();
    watchdog.toolFinished();
    trace.toolAnswered(name, id, answer, startedAt);
    if (!closed()) {
      this.deliver(asked, { id, name }, answer, own);
    }
  }

  private deliver(
    asked: LiveSession | null,
    call: ToolCallRef,
    answer: ToolAnswer,
    own: TurnTool | undefined,
  ): void {
    const { kit, record, renewal, watchdog, session, now } = this.ports;
    const live = session();
    const scheduling = own?.delivery ?? timingOf(kit.store.assistantChat.settings().voice);
    const to = { session: live, record, scheduling };
    if (live === asked) {
      deliverToolAnswer(to, call, answer);
    } else {
      deliverLateAnswer(to, call, answer);
    }
    renewal.delivered(call.name, answer);
    watchdog.asked(now());
  }

  private answer(
    name: string,
    args: Readonly<Record<string, unknown>>,
    own: TurnTool | undefined,
  ): Promise<ToolAnswer> {
    if (own !== undefined) {
      return own.run(stringsOf(args));
    }
    if (this.ports.bare) {
      return Promise.resolve(failedAnswer(new Error(`There is no turn tool named ${name}`)));
    }
    const asked = voiceArgumentsOf(name, args);
    return this.ports.hub.call(name, asked, this.toolCaller()).then((result) => ({
      response: voiceResponseOf(name, asked, result.response),
      line: result.line,
      pictures: result.pictures,
    }));
  }

  private toolCaller(): ToolCaller {
    const { caller, chatId } = this.ports.who;
    return {
      profileId: caller.profileId,
      role: caller.role,
      chatId,
      via: 'voice',
      clientId: caller.clientId,
      ...limitsOf(caller.requester, caller.pluginId),
    };
  }

  private task(id: string, name: string, args: Readonly<Record<string, unknown>>): void {
    const { session, assistantTools } = this.ports;
    if (!assistantTools().some((tool) => tool.name === name)) {
      session()?.toolResult(
        id,
        name,
        { error: 'Background tasks are unavailable in this call' },
        { scheduling: 'silent', more: false },
      );
      return;
    }
    this.startTask(id, name, stringArgument(args, 'task'));
  }

  private startTask(id: string, name: string, task: string): void {
    const { kit, who, session, text, record, messageId, trace } = this.ports;
    const reply = (response: Readonly<Record<string, unknown>>, more: boolean): void => {
      session()?.toolResult(id, name, response, { scheduling: more ? 'idle' : 'silent', more });
    };
    if (task === '') {
      reply({ error: 'No task was given' }, false);
      return;
    }
    try {
      const eventId = kit.responder.request({
        profileId: who.caller.profileId,
        clientId: who.caller.clientId,
        device: who.caller.device,
        task,
        said: text.recentHeard(),
        callMessageId: messageId,
        chatId: who.chatId,
      });
      this.tasks.set(eventId, { id, name, session: session() });
      record({ who: 'tool', text: 'Handed over a task', ok: true, detail: null });
      reply({ status: 'started; it is running now' }, true);
    } catch (cause) {
      trace.taskRefused(cause);
      reply({ error: messageOf(cause) }, false);
    }
  }
}
