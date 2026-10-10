import type { FunctionDeclaration, UsageMetadata } from '@google/genai';
import { assistantLabel, type CallEnding } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { stringArgument } from '../ai-tools/arguments';
import type { ToolCaller } from '../ai-tools/hub-tool';
import { limitsOf } from '../ai-tools/plugin-turn';
import type { PriceBook } from '../ledger/gemini-live';
import { meter, type Metered } from './call-parts';
import { CallRecord, type RecordedTurn } from './call-record';
import type { LiveEvents, LiveSession, Picture, ToolScheduling, VoiceProvider } from './gemini';
import { connectWithin } from './live-connect';
import { liveWindow } from './live-window';
import { failedAnswer, type ToolAnswer } from './tool-answer';
import { deliverToolAnswer, timingOf } from './tool-delivery';
import { declarationOf, stringsOf } from './turn-tool';
import { trackToolProgress } from './tool-progress';
import { TurnText } from './turn-text';
import {
  callSearchesWeb,
  declarationsOf,
  systemOf,
  type VoiceKit,
  type VoiceWho,
} from './voice-kit';
import { VOICE_TOOL_NAMES } from './voice-tools';

interface TurnToolParameter {
  readonly description: string;
  readonly required: boolean;
  readonly choices?: readonly string[];
}

export interface TurnTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, TurnToolParameter>>;
  readonly delivery: ToolScheduling;
  readonly run: (args: Readonly<Record<string, string>>) => Promise<ToolAnswer>;
}

export interface TurnEvents {
  readonly audio: (pcm24k: Int16Array) => void;
  readonly heard: (text: string) => void;
  readonly said: (text: string) => void;
  readonly interrupted: () => void;
  readonly spoken?: () => boolean;
  readonly turnComplete: () => void;
  readonly ended: (reason: CallEnding, detail: string | null) => void;
}

export interface TurnSessionOptions {
  readonly id: string;
  readonly kit: VoiceKit & { readonly prices: PriceBook; readonly log: Logger };
  readonly provider: VoiceProvider;
  readonly who: VoiceWho;
  readonly pluginId: string;
  readonly tools: readonly TurnTool[];
  readonly events: TurnEvents;
  readonly bare?: boolean;
}

class TurnToolNameTakenError extends Error {
  override readonly name = 'TurnToolNameTakenError';

  constructor(name: string) {
    super(
      `The tool ${name} is already one of the assistant’s own; give the turn tool another name.`,
    );
  }
}

export class TurnSession {
  private session: LiveSession | null = null;
  private resume: string | null = null;
  private generation = 0;
  private reconnected = false;
  private closed = false;
  private userTalking = false;
  private assistantTalking = false;
  private readonly text = new TurnText();
  private readonly record: CallRecord;
  private readonly tasks = new Map<string, { readonly id: string; readonly name: string }>();

  constructor(private readonly options: TurnSessionOptions) {
    const { kit, who } = options;
    const own = this.assistantTools().map((declaration) => declaration.name);
    options.tools.forEach((tool) => {
      if (own.includes(tool.name)) {
        throw new TurnToolNameTakenError(tool.name);
      }
    });
    this.record = new CallRecord(kit.store, {
      chatId: who.chatId,
      profileId: who.caller.profileId,
      clientId: who.caller.clientId,
      author: assistantLabel(kit.store.assistantChat.settings()),
      person: who.caller.person,
    });
  }

  get id(): string {
    return this.options.id;
  }

  get active(): boolean {
    return !this.closed;
  }

  async start(opening: string | null): Promise<void> {
    this.session = await this.open();
    if (!this.active) {
      this.session.close();
      return;
    }
    if (opening !== null) {
      this.session.text(opening, true);
    }
  }

  begin(): void {
    this.userTalking = true;
    this.session?.speaking(true);
  }

  hear(pcm16k: Int16Array): void {
    this.session?.audio(pcm16k);
  }

  finish(): void {
    this.userTalking = false;
    this.session?.speaking(false);
  }

  say(text: string, respond: boolean, picture?: Picture): void {
    if (picture !== undefined) {
      this.session?.picture(picture);
    }
    this.session?.text(text, respond);
  }

  owns(callMessageId: string): boolean {
    return !this.closed && this.record.messageId === callMessageId;
  }

  taskUpdate(eventId: string, text: string): boolean {
    const call = this.tasks.get(eventId);
    if (this.closed || call === undefined || this.session === null) {
      return false;
    }
    const scheduling = timingOf(this.options.kit.store.assistantChat.settings().voice);
    this.session.toolResult(call.id, call.name, { update: text }, { scheduling, more: true });
    return true;
  }

  async reopen(options: { readonly fresh: boolean }): Promise<void> {
    if (this.closed) {
      return;
    }
    const previous = this.session;
    this.session = null;
    this.generation += 1;
    if (options.fresh) {
      this.resume = null;
    }
    previous?.close();
    try {
      const next = await this.open();
      if (!this.active) {
        next.close();
        return;
      }
      this.session = next;
    } catch (cause) {
      this.end('failed', cause instanceof Error ? cause.message : 'Gemini did not reopen');
    }
  }

  end(reason: CallEnding, detail: string | null = null): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.generation += 1;
    this.session?.close();
    this.flush();
    this.record.close();
    this.options.kit.responder.callEnded(this.options.who.chatId, this.record.transcript());
    this.options.events.ended(reason, detail);
  }

  private assistantTools(): readonly FunctionDeclaration[] {
    return this.options.bare === true ? [] : declarationsOf(this.options.kit, this.options.who);
  }

  private open(): Promise<LiveSession> {
    const { kit, who, tools } = this.options;
    const settings = kit.store.assistantChat.settings();
    this.generation += 1;
    const generation = this.generation;
    return connectWithin(
      this.options.provider.live(
        {
          model: settings.voice.model,
          voice: settings.voice.voice,
          system: this.options.bare === true ? (who.place ?? '') : systemOf(kit, who),
          tools: [...this.assistantTools(), ...tools.map(declarationOf)],
          webSearch: callSearchesWeb(kit, who),
          resume: this.resume,
          window: liveWindow(settings),
          automatic: false,
        },
        this.events(() => generation === this.generation, settings.voice.model),
      ),
    );
  }

  private events(current: () => boolean, model: string): LiveEvents {
    const live =
      <A extends unknown[]>(handle: (...args: A) => void) =>
      (...args: A): void => {
        if (current()) {
          handle(...args);
        }
      };
    const { events } = this.options;
    return {
      audio: live((pcm: Int16Array) => {
        this.assistantTalking = true;
        events.audio(pcm);
      }),
      said: live((text: string) => {
        events.said(text);
        this.text.said(text);
      }),
      heard: live((text: string) => {
        events.heard(text);
        this.text.heard(text);
      }),
      interrupted: live(() => {
        this.assistantTalking = false;
        this.flush();
        events.interrupted();
      }),
      turnComplete: live(() => {
        this.assistantTalking = false;
        this.flush();
        events.turnComplete();
      }),
      tool: live((id: string, name: string, args: Readonly<Record<string, unknown>>) => {
        void this.tool(id, name, args);
      }),
      resumable: live((handle: string) => {
        this.resume = handle;
      }),
      usage: (usage: UsageMetadata): void => {
        meter(this.options.kit, this.metered(), usage, model);
      },
      closed: live((reason: string) => {
        void this.dropped(reason);
      }),
    };
  }

  private metered(): Metered {
    const { id, who, pluginId } = this.options;
    return { id, chatId: who.chatId, pluginId, caller: who.caller, record: this.record };
  }

  private flush(): void {
    const heard = this.text.takeHeard();
    if (heard !== '') {
      this.record.add({ who: 'person', text: heard, ok: true, detail: null });
    }
    const said = this.text.takeSaid();
    if (said !== '' && (this.options.events.spoken?.() ?? true)) {
      this.record.add({ who: 'assistant', text: said, ok: true, detail: null });
    }
  }

  private async tool(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const own = this.options.tools.find((tool) => tool.name === name);
    if (own === undefined && name === VOICE_TOOL_NAMES.task) {
      this.startTask(id, name, stringArgument(args, 'task'));
      return;
    }
    const stopProgress = trackToolProgress(name, {
      session: () => this.session,
      closed: () => this.closed,
      userSpeaking: () => this.userTalking,
      assistantSpeaking: () => this.assistantTalking,
      now: Date.now,
    });
    const answer = await this.answer(name, args, own).catch(failedAnswer);
    stopProgress();
    if (this.closed) {
      return;
    }
    const scheduling =
      own?.delivery ?? timingOf(this.options.kit.store.assistantChat.settings().voice);
    const to = { session: this.session, record: this.recorder(), scheduling };
    deliverToolAnswer(to, { id, name }, answer);
  }

  private answer(
    name: string,
    args: Readonly<Record<string, unknown>>,
    own: TurnTool | undefined,
  ): Promise<ToolAnswer> {
    if (own !== undefined) {
      return own.run(stringsOf(args));
    }
    return this.options.kit.tools.call(name, args, this.toolCaller()).then((result) => ({
      response: result.response,
      line: result.line,
      pictures: result.pictures,
    }));
  }

  private toolCaller(): ToolCaller {
    const { caller, chatId } = this.options.who;
    return {
      profileId: caller.profileId,
      role: caller.role,
      chatId,
      via: 'voice',
      clientId: caller.clientId,
      ...limitsOf(caller.requester, caller.pluginId),
    };
  }

  private recorder(): (turn: RecordedTurn) => void {
    return (turn): void => {
      this.record.add(turn);
    };
  }

  private startTask(id: string, name: string, task: string): void {
    const reply = (response: Readonly<Record<string, unknown>>, more: boolean): void => {
      this.session?.toolResult(id, name, response, { scheduling: more ? 'idle' : 'silent', more });
    };
    if (task === '') {
      reply({ error: 'No task was given' }, false);
      return;
    }
    const { kit, who } = this.options;
    try {
      const eventId = kit.responder.request({
        profileId: who.caller.profileId,
        clientId: who.caller.clientId,
        device: who.caller.device,
        task,
        said: this.text.recentHeard(),
        callMessageId: this.record.messageId,
        chatId: who.chatId,
      });
      this.tasks.set(eventId, { id, name });
      this.record.add({ who: 'tool', text: 'Handed over a task', ok: true, detail: null });
      reply({ status: 'started; it is running now' }, true);
    } catch (cause) {
      reply(
        { error: cause instanceof Error ? cause.message : 'That cannot be done from here' },
        false,
      );
    }
  }

  private async dropped(reason: string): Promise<void> {
    if (this.closed) {
      return;
    }
    if (this.reconnected || this.resume === null) {
      this.end('failed', reason);
      return;
    }
    this.reconnected = true;
    await this.reopen({ fresh: false });
  }
}
