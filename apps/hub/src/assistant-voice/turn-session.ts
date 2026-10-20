import type { FunctionDeclaration, UsageMetadata } from '@google/genai';
import {
  assistantLabel,
  voiceModelFor,
  voiceThinkingOf,
  type CallEnding,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PriceBook } from '../ledger/gemini-live';
import { meter, type Metered } from './call-parts';
import { CallRecord, type RecordedTurn } from './call-record';
import { currentEvents } from './conversation-live';
import { ConversationTrace } from './conversation-trace';
import { SessionRenewer } from './conversation-renew';
import type { LiveEvents, LiveSession, Picture, ToolScheduling, VoiceProvider } from './gemini';
import { LiveRenewal, trackedSession, type RenewReason } from './live-renewal';
import { ModelReplies } from './model-replies';
import { ReplyWatchdog } from './reply-watchdog';
import { connectWithin } from './live-connect';
import { liveWindow } from './live-window';
import { TurnSessionTrace } from './turn-session-trace';
import type { ToolAnswer } from './tool-answer';
import { TurnTools } from './turn-session-tools';
import { TurnText } from './turn-text';
import type { ToolHub } from '../ai-tools/tool-hub';
import {
  callSearchesWeb,
  declarationsOf,
  turnSystemOf,
  voiceHub,
  type VoiceKit,
  type VoiceWho,
} from './voice-kit';
import { background } from '@smarteverything/logging';

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
  private generation = 0;
  private closed = false;
  private userTalking = false;
  private assistantTalking = false;
  private readonly text = new TurnText();
  private readonly renewal = new LiveRenewal(() =>
    liveWindow(this.options.kit.store.assistantChat.settings()),
  );
  private readonly watchdog = new ReplyWatchdog();
  private readonly record: CallRecord;
  private readonly hub: ToolHub;
  private readonly trace: TurnSessionTrace;
  private readonly renewer: SessionRenewer;
  private readonly replies: ModelReplies;
  private readonly tools: TurnTools;
  private readonly now: () => number;

  constructor(private readonly options: TurnSessionOptions) {
    const { kit, who } = options;
    this.now = (): number => kit.now().getTime();
    this.trace = new TurnSessionTrace(
      kit.log,
      { sessionId: options.id, chatId: who.chatId, pluginId: options.pluginId },
      () => this.generation,
    );
    this.hub = voiceHub(kit, () => who);
    const own = [
      ...this.assistantTools().map((declaration) => declaration.name),
      ...(options.bare === true ? [] : this.hub.list().map((tool) => tool.name)),
    ];
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
    const conversation = new ConversationTrace(() => options.id);
    this.replies = new ModelReplies(this.watchdog, this.renewal, conversation, this.now);
    this.renewer = this.renewerOf(conversation);
    this.tools = this.toolsOf();
  }

  get id(): string {
    return this.options.id;
  }

  get active(): boolean {
    return !this.closed;
  }

  async start(opening: string | null): Promise<void> {
    const startedAt = performance.now();
    try {
      this.session = await this.open(null, null);
    } catch (cause) {
      this.trace.openFailed(cause, startedAt);
      throw cause;
    }
    this.trace.opened(startedAt);
    if (!this.active) {
      this.trace.closedWhileOpening();
      this.session.close();
      return;
    }
    if (opening !== null) {
      this.session.text(opening, true);
      this.watchdog.asked(this.now());
    }
  }

  begin(): void {
    this.userTalking = true;
    this.watchdog.turnStarted(this.now());
    this.session?.speaking(true);
  }

  hear(pcm16k: Int16Array): void {
    this.session?.audio(pcm16k);
  }

  finish(): void {
    this.userTalking = false;
    this.watchdog.turnEnded(this.now());
    this.session?.speaking(false);
  }

  say(text: string, respond: boolean, picture?: Picture): void {
    if (picture !== undefined) {
      this.session?.picture(picture);
    }
    this.session?.text(text, respond);
    if (respond) {
      this.watchdog.asked(this.now());
    }
  }

  owns(callMessageId: string): boolean {
    return !this.closed && this.record.messageId === callMessageId;
  }

  taskUpdate(eventId: string, text: string): boolean {
    return this.tools.taskUpdate(eventId, text);
  }

  async reopen(): Promise<void> {
    this.renewal.forget();
    await this.renewer.renew('stalled');
  }

  end(reason: CallEnding, detail: string | null = null): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.trace.ended(reason, detail);
    this.generation += 1;
    this.session?.close();
    this.flush();
    this.record.close();
    this.options.kit.responder.callEnded(this.options.who.chatId, this.record.transcript());
    this.options.events.ended(reason, detail);
  }

  private assistantTools(): readonly FunctionDeclaration[] {
    return this.options.bare === true
      ? []
      : declarationsOf(this.options.kit, this.hub, this.options.who);
  }

  private renewerOf(trace: ConversationTrace): SessionRenewer {
    return new SessionRenewer({
      renewal: this.renewal,
      watchdog: this.watchdog,
      trace,
      now: this.now,
      session: (): LiveSession | null => this.session,
      hold: (buffer): void => {
        this.session = buffer;
        this.generation += 1;
        this.assistantTalking = false;
        this.replies.cut();
        this.flush();
      },
      attach: (session): void => {
        this.session = session;
      },
      open: (resume, reason): Promise<LiveSession> => this.open(resume, reason),
      talking: (): boolean => this.userTalking,
      active: (): boolean => this.active,
      end: (reason, detail): Promise<void> => {
        this.end(reason, detail);
        return Promise.resolve();
      },
    });
  }

  private toolsOf(): TurnTools {
    const { kit, who, bare = false } = this.options;
    return new TurnTools({
      kit,
      who,
      hub: this.hub,
      tools: this.options.tools,
      bare,
      assistantTools: () => this.assistantTools(),
      messageId: this.record.messageId,
      trace: this.trace,
      renewal: this.renewal,
      watchdog: this.watchdog,
      text: this.text,
      record: this.recorded,
      now: this.now,
      session: (): LiveSession | null => this.session,
      closed: (): boolean => this.closed,
      userSpeaking: (): boolean => this.userTalking,
      assistantSpeaking: (): boolean => this.assistantTalking,
    });
  }

  private open(resume: string | null, reason: RenewReason | null): Promise<LiveSession> {
    const { kit, who } = this.options;
    const settings = kit.store.assistantChat.settings();
    this.generation += 1;
    const generation = this.generation;
    const model = voiceModelFor(settings.voice.thinking_level);
    const thinking = voiceThinkingOf(settings.voice.thinking_level);
    this.renewal.opening(reason, resume !== null, this.now());
    return connectWithin(
      this.options.provider.live(
        {
          model,
          voice: settings.voice.voice,
          system: turnSystemOf(kit, this.hub, who, this.options.bare === true),
          tools: [...this.assistantTools(), ...this.tools.declarations()],
          webSearch: callSearchesWeb(this.hub),
          resume,
          window: liveWindow(settings),
          automatic: false,
          ...(thinking === null ? {} : { thinking }),
        },
        this.events(() => generation === this.generation, model),
      ),
    ).then((session) => trackedSession(session, this.renewal));
  }

  private events(current: () => boolean, model: string): LiveEvents {
    const { events } = this.options;
    return currentEvents(current, this.renewal, {
      audio: (pcm) => {
        this.replies.output();
        this.assistantTalking = true;
        events.audio(pcm);
      },
      said: (text) => {
        this.replies.output();
        events.said(text);
        this.text.said(text);
      },
      heard: (text) => {
        events.heard(text);
        this.text.heard(text);
      },
      interrupted: () => {
        this.assistantTalking = false;
        this.replies.cut();
        this.flush();
        events.interrupted();
      },
      turnComplete: () => {
        this.assistantTalking = false;
        this.replies.completed();
        this.flush();
        events.turnComplete();
        this.renewIfDue();
      },
      tool: (id, name, args) => {
        this.replies.output();
        this.tools.handle(id, name, args);
      },
      resumable: (handle) => {
        this.renewal.resumable(handle);
        this.renewIfDue();
      },
      goAway: () => {
        this.renewal.want('go_away');
        this.renewIfDue();
      },
      usage: (usage: UsageMetadata) => {
        meter(this.options.kit, this.metered(), usage, model);
      },
      closed: (reason, code) => {
        this.dropped(reason, code);
      },
    });
  }

  private dropped(reason: string, code: number): void {
    this.trace.dropped(reason, code);
    background(this.renewer.renew('dropped', { reason, code }), 'turn_session.renew_failed');
  }

  private renewIfDue(): void {
    if (this.closed || this.userTalking || this.assistantTalking || this.watchdog.busy()) {
      return;
    }
    const due = this.renewal.due(false);
    if (due !== null) {
      background(this.renewer.renew(due), 'turn_session.renew_failed');
    }
  }

  private metered(): Metered {
    const { id, who, pluginId } = this.options;
    return { id, chatId: who.chatId, pluginId, caller: who.caller, record: this.record };
  }

  private readonly recorded = (turn: RecordedTurn): void => {
    this.renewal.recorded(turn);
    this.record.add(turn);
  };

  private flush(): void {
    const heard = this.text.takeHeard();
    if (heard !== '') {
      this.recorded({ who: 'person', text: heard, ok: true, detail: null });
    }
    const said = this.text.takeSaid();
    if (said !== '' && (this.options.events.spoken?.() ?? true)) {
      this.recorded({ who: 'assistant', text: said, ok: true, detail: null });
    }
  }
}
