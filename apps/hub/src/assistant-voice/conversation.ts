import type { UsageMetadata } from '@google/genai';
import type { CallEnding } from '@smarteverything/domain';
import { opusCodec, OpusFramer, type OpusCodec } from './audio';
import type { ConversationHooks } from './conversation-hooks';
import { VoiceTools } from './conversation-tools';
import { connectWithin } from './live-connect';
import { MicMeter } from './mic-meter';
import { sightWindow, sameTuning, type SightTuning } from './live-window';
import { ReplyWatchdog, type WatchdogStep } from './reply-watchdog';
import type { LiveEvents, LiveSession, Picture, VoiceProvider } from './gemini';
import type { CallLink } from './call-link';
import { speechInput, streamsInput, type SpeechInput } from './speech-input';
import { TurnText, isFarewell } from './turn-text';
import { TurnTimer } from './turn-timing';
import type { SpeechGateEvents } from './speech-gate';
import type { VideoFrame } from './video';

const STOP_GRACE_MS = 5000;
const TICK_MS = 100;
const USER_QUIET_MS = 1500;
export const REPLY_GRACE_MS = 6000;
const NUDGE = '[They finished speaking and you have not answered yet. Answer them now.]';
const SAY_NOW = '[Say this to them now, naturally and in your own words]';

export class Conversation {
  private session: LiveSession | null = null;
  private resume: string | null = null;
  private readonly codec: OpusCodec = opusCodec();
  private readonly framer = new OpusFramer(this.codec);
  private readonly text = new TurnText();
  private input: SpeechInput | null = null;
  private readonly watchdog = new ReplyWatchdog();
  private timer: NodeJS.Timeout | null = null;
  private stopTimer: NodeJS.Timeout | null = null;
  private lastActivity: number;
  private lastBusy: number;
  private closed = false;
  private stopping = false;
  private turnDone = false;
  private speaking = false;
  private reconnected = false;
  private generation = 0;
  private muted = false;
  private suppressed = false;
  private tuning: SightTuning | null = null;
  private openedWith: SightTuning | null = null;
  private readonly tools: VoiceTools;
  private readonly meter: MicMeter;
  private readonly timing: TurnTimer;

  constructor(
    private readonly provider: VoiceProvider,
    private readonly link: CallLink,
    private readonly hooks: ConversationHooks,
    private readonly now: () => number = Date.now,
  ) {
    this.lastActivity = now();
    this.lastBusy = this.lastActivity;
    this.meter = new MicMeter(now, hooks.measured);
    this.timing = new TurnTimer(now, hooks.measured, () => this.meter.sinceVoiceMs);
    this.tools = new VoiceTools({
      hooks,
      timing: this.timing,
      now,
      link,
      watchdog: this.watchdog,
      text: this.text,
      session: (): LiveSession | null => this.session,
      closed: (): boolean => this.closed,
      userSpeaking: (): boolean => (this.meter.sinceVoiceMs ?? Infinity) < USER_QUIET_MS,
      assistantSpeaking: (): boolean => this.speaking || this.link.playing(),
      flushHeard: this.flushHeard.bind(this),
      finishSoon: this.finishSoon.bind(this),
    });
  }

  get active(): boolean {
    return !this.closed;
  }

  async start(first: string | null, heard?: () => Int16Array): Promise<void> {
    this.link.state('connecting');
    const [input, session] = await Promise.all([this.listen(), this.open()]);
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
    }
  }

  say(text: string): void {
    if (!this.closed) {
      this.lastActivity = this.now();
      this.session?.text(`${SAY_NOW} ${text}`, true);
    }
  }

  taskUpdate(eventId: string, text: string): boolean {
    return this.tools.taskUpdate(eventId, text);
  }

  private async reopen(): Promise<void> {
    if (this.closed || this.session === null) {
      return;
    }
    const previous = this.session;
    this.session = null;
    this.generation += 1;
    this.cut();
    this.input?.reset();
    previous.close();
    const next = await this.open()
      .catch(() => {
        this.resume = null;
        return this.open();
      })
      .catch(async (cause: unknown) => {
        await this.end('failed', cause instanceof Error ? cause.message : 'Gemini did not reopen');
        return null;
      });
    if (next === null) {
      return;
    }
    if (!this.active) {
      next.close();
      return;
    }
    this.session = next;
  }

  async end(reason: CallEnding, detail: string | null = null): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearInterval(this.timer ?? undefined);
    clearTimeout(this.stopTimer ?? undefined);
    this.cut();
    this.session?.close();
    this.codec.free();
    this.hooks.ended(reason, detail);
    await this.input?.release();
  }

  private listen(): Promise<SpeechInput> {
    const audible = (): boolean => this.speaking || this.link.playing();
    return speechInput(this.hooks.speech, this.speechEvents(), {
      assistantAudible: audible,
      now: this.now,
      meter: this.meter,
    });
  }

  private speechEvents(): SpeechGateEvents {
    return {
      start: (): void => {
        this.suppressed = false;
        this.lastActivity = this.now();
        this.watchdog.turnStarted(this.now());
        this.session?.speaking(true);
      },
      audio: (pcm): void => {
        this.lastActivity = streamsInput(this.hooks.speech) ? this.lastActivity : this.now();
        this.session?.audio(pcm);
      },
      end: (): void => {
        this.watchdog.turnEnded(this.now());
        this.session?.speaking(false);
      },
      failed: (reason): void => {
        void this.end('failed', reason);
      },
    };
  }

  private open(): Promise<LiveSession> {
    const settings = this.hooks.settings();
    this.generation += 1;
    const generation = this.generation;
    const current = (): boolean => generation === this.generation;
    const base = this.hooks.window();
    this.openedWith = this.tuning;
    const options = {
      model: settings.model,
      voice: settings.voice,
      system: this.hooks.system(),
      tools: this.hooks.tools(),
      resume: this.resume,
      window: this.tuning === null ? base : sightWindow(this.tuning, base),
      automatic: streamsInput(this.hooks.speech),
      ...(this.tuning === null ? {} : { resolution: this.tuning.resolution }),
      ...(this.hooks.listening?.pauseMs === undefined
        ? {}
        : { pauseMs: this.hooks.listening.pauseMs }),
    };
    return connectWithin(this.provider.live(options, this.events(current, settings.model)));
  }

  private events(current: () => boolean, model: string): LiveEvents {
    const live =
      <A extends unknown[]>(handle: (...args: A) => void) =>
      (...args: A): void => {
        if (current()) {
          handle(...args);
        }
      };
    return {
      audio: live((pcm: Int16Array) => {
        this.play(pcm);
      }),
      said: live((text: string) => {
        this.link.caption('assistant', this.text.said(text));
      }),
      heard: live((text: string) => {
        this.lastActivity = this.now();
        this.timing.heard();
        this.link.caption('person', this.text.heard(text));
      }),
      interrupted: live(() => {
        this.cut();
      }),
      turnComplete: live(() => {
        this.finishTurn();
      }),
      tool: live((id: string, name: string, args: Readonly<Record<string, unknown>>) => {
        this.tools.handle(id, name, args);
      }),
      resumable: live((handle: string) => {
        this.resume = handle;
      }),
      usage: (usage: UsageMetadata): void => {
        this.hooks.usage(usage, model);
      },
      closed: live((reason: string) => {
        void this.dropped(reason);
      }),
    };
  }

  private play(pcm: Int16Array): void {
    if (this.closed || this.suppressed) {
      return;
    }
    this.lastActivity = this.now();
    this.watchdog.replied();
    this.meter.played(pcm);
    if (!this.speaking) {
      this.timing.spoke();
      this.speaking = true;
      this.flushHeard();
      this.link.state('speaking');
    }
    this.link.audio(this.framer.live(pcm));
  }

  private cut(): void {
    this.link.cut();
    this.framer.reset();
    this.speaking = false;
    this.flushHeard();
    this.flushSaid();
  }

  private finishTurn(): void {
    this.suppressed = false;
    this.watchdog.replied();
    if (this.stopping) {
      this.turnDone = true;
    }
    this.link.audio(this.framer.flush());
    this.speaking = false;
    this.flushHeard();
    const said = this.flushSaid();
    if (isFarewell(said)) {
      this.stopping = true;
      this.turnDone = true;
    }
    this.link.state('listening');
  }

  private finishSoon(): void {
    this.stopping = true;
    this.stopTimer ??= setTimeout(() => {
      void this.end('finished');
    }, STOP_GRACE_MS);
    this.stopTimer.unref();
  }

  private flushHeard(): void {
    const heard = this.text.takeHeard();
    if (heard !== '') {
      this.hooks.record({ who: 'person', text: heard, ok: true, detail: null });
    }
  }

  private flushSaid(): string {
    const said = this.text.takeSaid();
    if (said !== '') {
      this.hooks.record({ who: 'assistant', text: said, ok: true, detail: null });
    }
    return said;
  }

  private async dropped(reason: string): Promise<void> {
    if (this.closed) {
      return;
    }
    if (this.reconnected || this.resume === null) {
      await this.end('failed', reason);
      return;
    }
    this.reconnected = true;
    this.input?.reset();
    try {
      this.session = await this.open();
    } catch (cause) {
      await this.end('failed', cause instanceof Error ? cause.message : reason);
    }
  }

  private guard(step: WatchdogStep): void {
    if (step === 'end_turn') {
      this.input?.reset();
    } else if (step === 'nudge') {
      this.hooks.stalled('nudged');
      this.session?.text(NUDGE, true);
    } else if (step === 'give_up') {
      this.hooks.stalled('gave_up');
      if (!this.hooks.staysOpenWhenQuiet()) {
        void this.end('failed', 'The AI stopped answering; call again.');
      }
    }
  }

  private tick(): void {
    if (this.closed || this.session === null) {
      return;
    }
    if (this.turnDone && !this.speaking && !this.link.playing()) {
      void this.end('finished');
      return;
    }
    this.guard(this.watchdog.check(this.now()));
    this.watchIdle();
  }

  private watchIdle(): void {
    const idleMs = (this.hooks.listening?.idleSeconds ?? this.hooks.settings().idle_seconds) * 1000;
    if (this.busy() || this.hooks.detached?.() === true) {
      this.lastActivity = this.now();
      this.lastBusy = this.lastActivity;
    } else if (!this.hooks.staysOpenWhenQuiet() && this.quietFor(idleMs)) {
      void this.end('idle');
    } else if (this.resume !== null && !sameTuning(this.tuning, this.openedWith)) {
      void this.reopen();
    }
  }

  private quietFor(idleMs: number): boolean {
    return this.now() - this.lastActivity > idleMs && this.now() - this.lastBusy > REPLY_GRACE_MS;
  }

  private busy(): boolean {
    return this.speaking || this.link.playing() || this.watchdog.busy();
  }
}
