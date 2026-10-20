import type { CallEnding } from '@smarteverything/domain';
import { opusCodec, OpusFramer, type OpusCodec } from './audio';
import type { ConversationHooks } from './conversation-hooks';
import { VoiceTools } from './conversation-tools';
import { ConversationTrace } from './conversation-trace';
import { IdleClock } from './idle-clock';
import { connectWithin } from './live-connect';
import { SessionRenewer, STOPPED_ANSWERING } from './conversation-renew';
import { currentEvents, liveOptionsOf } from './conversation-live';
import { ModelReplies } from './model-replies';
import { LiveRenewal, trackedSession, type RenewReason } from './live-renewal';
import { MicMeter } from './mic-meter';
import { sameTuning, type SightTuning } from './live-window';
import { ReplyWatchdog, type WatchdogStep } from './reply-watchdog';
import type { LiveEvents, LiveSession, Picture } from './gemini';
import type { VoiceLine } from './voice-line';
import type { CallLink } from './call-link';
import type { RecordedTurn } from './call-record';
import { speechInput, type SpeechInput } from './speech-input';
import { TurnRecorder, TurnText, isFarewell } from './turn-text';
import { TurnTimer } from './turn-timing';
import type { SpeechGateEvents } from './speech-gate';
import type { VideoFrame } from './video';
import { background } from '@smarteverything/logging';

const STOP_GRACE_MS = 5000;
const TICK_MS = 100;
const USER_QUIET_MS = 1500;
const NUDGE = '[They finished speaking and you have not answered yet. Answer them now.]';
const SAY_NOW = '[Say this to them now, naturally and in your own words]';

export class Conversation {
  private session: LiveSession | null = null;
  private readonly renewal = new LiveRenewal(() => this.hooks.window());
  private readonly codec: OpusCodec = opusCodec();
  private readonly framer = new OpusFramer(this.codec);
  private readonly text = new TurnText();
  private input: SpeechInput | null = null;
  private readonly watchdog = new ReplyWatchdog();
  private timer: NodeJS.Timeout | null = null;
  private stopTimer: NodeJS.Timeout | null = null;
  private readonly idle: IdleClock;
  private closed = false;
  private stopping = false;
  private turnDone = false;
  private speaking = false;
  private talking = false;
  private generation = 0;
  private muted = false;
  private suppressed = false;
  private tuning: SightTuning | null = null;
  private openedWith: SightTuning | null = null;
  private readonly tools: VoiceTools;
  private readonly meter: MicMeter;
  private readonly timing: TurnTimer;
  private readonly trace: ConversationTrace;
  private readonly renewer: SessionRenewer;
  private readonly replies: ModelReplies;
  private readonly recorder: TurnRecorder;

  constructor(
    private readonly line: VoiceLine,
    private readonly link: CallLink,
    private readonly hooks: ConversationHooks,
    private readonly now: () => number = Date.now,
  ) {
    this.trace = new ConversationTrace(() => hooks.callId?.());
    this.idle = new IdleClock(now);
    this.meter = new MicMeter(now, hooks.measured);
    this.timing = new TurnTimer(now, hooks.measured, () => this.meter.sinceVoiceMs);
    this.replies = new ModelReplies(this.watchdog, this.renewal, this.trace, now);
    this.recorder = new TurnRecorder(this.text, this.record);
    this.tools = new VoiceTools({
      hooks,
      record: this.record,
      renewal: this.renewal,
      timing: this.timing,
      now,
      link,
      watchdog: this.watchdog,
      text: this.text,
      session: (): LiveSession | null => this.session,
      closed: (): boolean => this.closed,
      userSpeaking: (): boolean => (this.meter.sinceVoiceMs ?? Infinity) < USER_QUIET_MS,
      assistantSpeaking: (): boolean => this.speaking || this.link.playing(),
      flushHeard: (): void => {
        this.recorder.heard();
      },
      finishSoon: this.finishSoon.bind(this),
    });
    this.renewer = this.renewerOf();
  }

  private renewerOf(): SessionRenewer {
    return new SessionRenewer({
      renewal: this.renewal,
      watchdog: this.watchdog,
      trace: this.trace,
      now: this.now,
      session: (): LiveSession | null => this.session,
      hold: (buffer): void => {
        this.session = buffer;
        this.generation += 1;
        this.cut();
      },
      attach: (session): void => {
        this.session = session;
      },
      open: (resume, reason): Promise<LiveSession> => this.open(resume, reason),
      talking: (): boolean => this.talking,
      active: (): boolean => this.active,
      end: (reason, detail): Promise<void> => this.end(reason, detail),
    });
  }

  get active(): boolean {
    return !this.closed;
  }

  async start(first: string | null, heard?: () => Int16Array): Promise<void> {
    this.trace.starting(first !== null);
    this.link.state('connecting');
    const [input, session] = await Promise.all([this.listen(), this.open(null, null)]);
    this.input = input;
    if (this.closed) {
      session.close();
      return;
    }
    this.session = session;
    const words = heard?.() ?? new Int16Array(0);
    if (first !== null) {
      session.text(first, words.length === 0);
    }
    if (words.length > 0) {
      input.hear(words);
    }
    this.link.state('listening');
    this.timer = setInterval(() => {
      this.tick();
    }, TICK_MS);
    this.timer.unref();
  }

  hear(pcm: Int16Array): void {
    if (!this.closed && !this.muted) {
      this.input?.hear(pcm);
    }
  }

  activity(speaking: boolean): boolean {
    if (this.closed || this.input === null) {
      return true;
    }
    return this.input.activity(speaking && !this.muted);
  }

  video(frame: VideoFrame): void {
    if (!this.closed) {
      this.session?.video(frame);
    }
  }

  tune(tuning: SightTuning | null): void {
    this.tuning = tuning;
  }

  interrupt(): void {
    if (!this.closed) {
      this.suppressed = true;
      this.cut();
    }
  }

  mute(muted: boolean): void {
    this.muted = muted;
    this.input?.reset();
  }

  note(text: string, picture?: Picture, respond = false): void {
    if (!this.closed) {
      if (picture !== undefined) {
        this.session?.picture(picture);
      }
      this.session?.text(text, respond);
      if (respond) {
        this.watchdog.asked(this.now());
      }
    }
  }

  say(text: string): void {
    if (!this.closed) {
      this.idle.model();
      this.session?.text(`${SAY_NOW} ${text}`, true);
      this.watchdog.asked(this.now());
    }
  }

  taskUpdate(eventId: string, text: string): boolean {
    return this.tools.taskUpdate(eventId, text);
  }

  async end(reason: CallEnding, detail: string | null = null): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearInterval(this.timer ?? undefined);
    clearTimeout(this.stopTimer ?? undefined);
    this.cut();
    this.codec.free();
    this.hooks.ended(reason, detail);
    this.line.release(this.session, this.hooks.history());
    await this.input?.release();
  }

  private listen(): Promise<SpeechInput> {
    const audible = (): boolean => this.speaking || this.link.playing();
    return speechInput(this.hooks.speech, this.speechEvents(), {
      ...(this.hooks.pause === undefined ? {} : { pause: this.hooks.pause }),
      assistantAudible: audible,
      now: this.now,
      meter: this.meter,
      voice: (speaking): void => {
        this.idle.person(speaking);
      },
    });
  }

  private speechEvents(): SpeechGateEvents {
    return {
      start: (): void => {
        this.talking = true;
        this.suppressed = false;
        this.idle.person(true);
        this.watchdog.turnStarted(this.now());
        this.session?.speaking(true);
      },
      audio: (pcm): void => {
        this.session?.audio(pcm);
      },
      end: (): void => {
        this.talking = false;
        this.idle.person(false);
        this.watchdog.turnEnded(this.now());
        this.session?.speaking(false);
      },
      failed: (reason): void => {
        background(this.end('failed', reason), 'conversation.end_failed');
      },
    };
  }

  private open(resume: string | null, reason: RenewReason | null): Promise<LiveSession> {
    this.generation += 1;
    const generation = this.generation;
    const current = (): boolean => generation === this.generation;
    this.openedWith = this.tuning;
    this.renewal.opening(reason, resume !== null, this.now());
    const options = liveOptionsOf(this.hooks, this.tuning, resume);
    this.watchdog.turnsDecidedByGemini(options.automatic);
    return connectWithin(this.line.live(options, this.events(current, options.model))).then(
      (session) =>
        this.opened(trackedSession(session, this.renewal), resume === null, reason === null),
    );
  }

  private opened(session: LiveSession, fresh: boolean, starting: boolean): LiveSession {
    const note = fresh ? this.hooks.note(starting ? this.line.known() : null, starting) : '';
    if (note !== '') {
      session.text(note, false);
    }
    return session;
  }

  private events(current: () => boolean, model: string): LiveEvents {
    return currentEvents(current, this.renewal, {
      audio: (pcm) => {
        this.replies.output();
        this.play(pcm);
      },
      said: (text) => {
        this.replies.output();
        this.link.caption('assistant', this.text.said(text));
      },
      heard: (text) => {
        if (!this.replies.answering) {
          this.watchdog.heard();
        }
        this.idle.heard();
        this.timing.heard();
        this.link.caption('person', this.text.heard(text));
      },
      interrupted: () => {
        this.cut();
      },
      turnComplete: () => {
        this.finishTurn();
      },
      tool: (id, name, args) => {
        this.replies.output();
        this.tools.handle(id, name, args);
      },
      resumable: (handle) => {
        this.renewal.resumable(handle);
      },
      goAway: () => {
        this.renewal.want('go_away');
      },
      usage: (usage) => {
        this.hooks.usage(usage, model);
      },
      closed: (reason, code) => {
        background(this.renewer.renew('dropped', { reason, code }), 'conversation.renew_failed');
      },
    });
  }

  private play(pcm: Int16Array): void {
    if (this.closed || this.suppressed) {
      return;
    }
    this.idle.model();
    this.watchdog.talking(this.now());
    this.meter.played(pcm);
    if (!this.speaking) {
      this.timing.spoke();
      this.sounding(true);
      this.recorder.heard();
      this.link.state('speaking');
    }
    this.link.audio(this.framer.live(pcm));
  }

  private sounding(speaking: boolean): void {
    if (this.speaking !== speaking) {
      this.speaking = speaking;
      this.hooks.speaking?.(speaking);
    }
  }

  private cut(): void {
    this.link.cut();
    this.framer.reset();
    this.sounding(false);
    this.replies.cut();
    this.recorder.heard();
    this.recorder.said();
  }

  private finishTurn(): void {
    this.suppressed = false;
    this.replies.completed();
    if (this.stopping) {
      this.turnDone = true;
    }
    this.link.audio(this.framer.flush());
    this.sounding(false);
    this.recorder.heard();
    const said = this.recorder.said();
    if (isFarewell(said)) {
      this.stopping = true;
      this.turnDone = true;
    }
    this.link.state('listening');
  }

  private finishSoon(): void {
    this.stopping = true;
    this.stopTimer ??= setTimeout(() => {
      background(this.end('finished'), 'conversation.end_failed');
    }, STOP_GRACE_MS);
    this.stopTimer.unref();
  }

  private readonly record = (turn: RecordedTurn): void => {
    this.renewal.recorded(turn);
    this.hooks.record(turn);
  };

  private guard(step: WatchdogStep): void {
    if (step === 'end_turn') {
      this.input?.reset();
    } else if (step === 'nudge') {
      this.hooks.stalled('nudged');
      this.session?.text(NUDGE, true);
    } else if (step === 'silent') {
      this.trace.silent(this.renewal.resumedLast);
      background(this.renewer.renew('silent'), 'conversation.renew_failed');
    } else if (step === 'give_up') {
      this.hooks.stalled('gave_up');
      if (!this.hooks.staysOpenWhenQuiet()) {
        background(this.end('failed', STOPPED_ANSWERING), 'conversation.end_failed');
      }
    }
  }

  private tick(): void {
    if (this.closed || this.session === null) {
      return;
    }
    if (this.turnDone && !this.speaking && !this.link.playing()) {
      background(this.end('finished'), 'conversation.end_failed');
      return;
    }
    this.guard(this.watchdog.check(this.now(), this.renewal.unanswered));
    this.watchIdle();
  }

  private watchIdle(): void {
    const idleMs = (this.hooks.listening?.idleSeconds ?? this.hooks.settings().idle_seconds) * 1000;
    if (this.busy() || this.hooks.detached?.() === true) {
      this.idle.model();
      return;
    }
    const decision = this.hooks.staysOpenWhenQuiet() ? null : this.idle.expired(idleMs);
    if (decision !== null) {
      this.trace.idleEnded(decision, this.hooks.speech);
      background(this.end('idle'), 'conversation.end_failed');
    } else {
      const due = this.renewal.due(!sameTuning(this.tuning, this.openedWith));
      if (due !== null) {
        background(this.renewer.renew(due), 'conversation.renew_failed');
      }
    }
  }

  private busy(): boolean {
    return this.speaking || this.link.playing() || this.watchdog.busy();
  }
}
