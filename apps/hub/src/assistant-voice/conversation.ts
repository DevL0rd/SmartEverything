import type { UsageMetadata } from '@google/genai';
import type { CallEnding } from '@smarteverything/domain';
import { opusCodec, OpusFramer, type OpusCodec } from './audio';
import { failedAnswer } from './tool-answer';
import type { ConversationHooks } from './conversation-hooks';
import { deliverToolAnswer, timingOf } from './tool-delivery';
import { connectWithin } from './live-connect';
import { ReplyWatchdog, type WatchdogStep } from './reply-watchdog';
import type { LiveEvents, LiveSession, VoiceProvider } from './gemini';
import type { CallLink } from './call-link';
import { stringArgument } from '../ai-tools/arguments';
import { speechInput, type SpeechInput } from './speech-input';
import { TurnText, isFarewell } from './turn-text';
import type { SpeechGateEvents } from './speech-gate';
import type { VideoFrame } from './video';
import { VOICE_TOOL_NAMES } from './voice-tools';

const STOP_GRACE_MS = 5000;
const TICK_MS = 100;
const NUDGE = '[They finished speaking and you have not answered yet. Answer them now.]';

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
  private closed = false;
  private stopping = false;
  private turnDone = false;
  private speaking = false;
  private reconnected = false;
  private generation = 0;
  private muted = false;
  private readonly tasks = new Map<string, { readonly id: string; readonly name: string }>();

  constructor(
    private readonly provider: VoiceProvider,
    private readonly link: CallLink,
    private readonly hooks: ConversationHooks,
    private readonly now: () => number = Date.now,
  ) {
    this.lastActivity = now();
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

  mute(muted: boolean): void {
    this.muted = muted;
    this.input?.reset();
  }

  taskUpdate(eventId: string, text: string): boolean {
    const call = this.tasks.get(eventId);
    if (this.closed || call === undefined || this.session === null) {
      return false;
    }
    this.lastActivity = this.now();
    const scheduling = timingOf(this.hooks.settings());
    this.session.toolResult(call.id, call.name, { update: text }, { scheduling, more: true });
    return true;
  }

  async reopen(): Promise<void> {
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
    });
  }

  private speechEvents(): SpeechGateEvents {
    return {
      start: (): void => {
        this.lastActivity = this.now();
        this.watchdog.turnStarted(this.now());
        this.session?.speaking(true);
      },
      audio: (pcm): void => {
        this.lastActivity = this.hooks.speech === 'raw' ? this.lastActivity : this.now();
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
    const options = {
      model: settings.model,
      voice: settings.voice,
      system: this.hooks.system(),
      tools: this.hooks.tools(),
      resume: this.resume,
      window: this.hooks.window(),
      automatic: this.hooks.speech === 'raw',
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
        this.link.caption('person', this.text.heard(text, this.now()));
      }),
      interrupted: live(() => {
        this.cut();
      }),
      turnComplete: live(() => {
        this.finishTurn();
      }),
      tool: live((id: string, name: string, args: Readonly<Record<string, unknown>>) => {
        this.tool(id, name, args);
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
    if (this.closed) {
      return;
    }
    this.lastActivity = this.now();
    this.watchdog.replied();
    if (!this.speaking) {
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

  private tool(id: string, name: string, args: Readonly<Record<string, unknown>>): void {
    this.watchdog.replied();
    this.flushHeard();
    if (name === VOICE_TOOL_NAMES.end) {
      this.session?.toolResult(id, name, { ok: true }, { scheduling: 'silent', more: false });
      this.stopping = true;
      this.stopTimer ??= setTimeout(() => {
        void this.end('finished');
      }, STOP_GRACE_MS);
      this.stopTimer.unref();
      return;
    }
    if (name === VOICE_TOOL_NAMES.task) {
      this.startTask(id, name, stringArgument(args, 'task'));
      return;
    }
    void this.runTool(id, name, args);
  }

  private startTask(id: string, name: string, task: string): void {
    const reply = (response: Readonly<Record<string, unknown>>, more: boolean): void => {
      this.session?.toolResult(id, name, response, { scheduling: more ? 'idle' : 'silent', more });
    };
    if (task === '') {
      reply({ error: 'No task was given' }, false);
      return;
    }
    try {
      const eventId = this.hooks.task(task, this.text.recentHeard());
      this.tasks.set(eventId, { id, name });
      this.hooks.record({ who: 'tool', text: 'Handed over a task', ok: true, detail: null });
      reply({ status: 'started; it is running now' }, true);
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'That cannot be done from here';
      reply({ error }, false);
    }
  }

  private async runTool(
    id: string,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    this.link.state('thinking');
    const heardSince = (at: number): string => this.text.heardSince(at);
    this.watchdog.toolStarted();
    const answer = await this.hooks.run(name, args, heardSince).catch(failedAnswer);
    this.watchdog.toolFinished();
    if (this.closed) {
      return;
    }
    const to = { session: this.session, record: this.hooks.record };
    deliverToolAnswer({ ...to, scheduling: timingOf(this.hooks.settings()) }, { id, name }, answer);
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
      void this.end('failed', 'The AI stopped answering; call again.');
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
    if (this.busy()) {
      this.lastActivity = this.now();
    } else if (this.now() - this.lastActivity > this.hooks.settings().idle_seconds * 1000) {
      void this.end('idle');
    }
  }

  private busy(): boolean {
    return this.speaking || this.link.playing() || this.watchdog.busy();
  }
}
