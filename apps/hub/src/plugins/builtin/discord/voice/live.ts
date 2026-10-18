import type { PluginVoice } from '../../../plugin-voice';
import { CONTEST_MS, type OnSuperseded } from '../../../../wake-name/wake-claims';
import { describePerson, type Person } from '../person';
import type { Policy } from '../policy';
import type { DiscordSettings } from '../settings';
import type { CallSession, HeardLine } from './call-session';
import { CALL_TITLE_PREFIX } from './calls';
import { Mixer } from './mixer';

type Hosted = Awaited<ReturnType<PluginVoice['host']>>;

const TYPED_WAKE_MS = 40_000;
const TYPED_LAG_MS = 3000;
const SAY_NOW = '[Say this to the call now, naturally and in your own words]';

class Live {
  call: Hosted | null = null;
  replaced = false;
  private readonly later: string[] = [];
  constructor(readonly startedAt: number) {}

  readonly mixer = new Mixer((pcm) => {
    this.call?.hear(pcm);
  });

  say(text: string): void {
    if (this.call === null) {
      this.later.push(text);
    } else {
      this.call.say(text);
    }
  }

  opened(call: Hosted): void {
    this.call = call;
    this.later.splice(0).forEach((text) => {
      call.say(text);
    });
    this.mixer.start();
  }

  async end(): Promise<void> {
    this.mixer.stop();
    await this.call?.end();
  }
}

export interface LiveDeps {
  readonly voice: Pick<PluginVoice, 'host' | 'ready'>;
  readonly settings: Pick<DiscordSettings, 'voice_idle_seconds' | 'voice_pause_ms'>;
  readonly policy: Pick<Policy, 'userAllowed'>;
  readonly place: (session: CallSession) => string;
  readonly muted: (session: CallSession) => boolean;
  readonly typed: (session: CallSession, person: Person, text: string) => void;
  readonly typeInCall: (session: CallSession, text: string) => Promise<void>;
  readonly botLine: (session: CallSession, text: string) => void;
  readonly changed: () => void;
  readonly now: () => number;
  readonly report: (cause: unknown) => void;
}

interface Engagement {
  readonly speakerId: string;
  readonly opening: string;
  readonly words?: () => Int16Array;
  readonly onSuperseded?: OnSuperseded;
}

export interface Waking {
  readonly phrase: string;
  readonly words: () => Int16Array;
  readonly onSuperseded: OnSuperseded;
}

function wakeReason(person: Person, phrase: string): string {
  return `${describePerson(person)} just said “${phrase}” in the call. If they asked something with it, answer that; if they only said your name, greet them in a word or two (like “Yes?”).`;
}

export class LiveVoices {
  private readonly lives = new Map<string, Live>();
  private readonly typedWakes = new Map<string, number>();
  private readonly lastLines = new Map<string, { readonly line: HeardLine; readonly at: number }>();

  constructor(private readonly deps: LiveDeps) {}

  active(guildId: string): boolean {
    return this.lives.has(guildId);
  }

  speaks(session: CallSession): boolean {
    return this.deps.voice.ready() && !this.deps.muted(session);
  }

  wakeable(session: CallSession, userId: string): boolean {
    const live = this.lives.get(session.guildId);
    return (
      this.deps.policy.userAllowed(userId) &&
      (live === undefined || this.deps.now() - live.startedAt < CONTEST_MS)
    );
  }

  mixes(session: CallSession, userId: string, pcm: Int16Array): void {
    this.lives.get(session.guildId)?.mixer.hear(userId, pcm);
  }

  wake(session: CallSession, person: Person, waking: Waking): void {
    const { phrase, words, onSuperseded } = waking;
    if (!this.wakeable(session, person.id)) {
      return;
    }
    if (!this.speaks(session)) {
      this.wakeTyped(session, person.id);
      onSuperseded(() => {
        this.typedWakes.delete(person.id);
        this.lastLines.delete(person.id);
      });
      return;
    }
    this.engage(session, {
      speakerId: person.id,
      opening: wakeReason(person, phrase),
      words,
      onSuperseded,
    }).catch(this.deps.report);
  }

  heard(session: CallSession, line: HeardLine): void {
    const live = this.lives.get(session.guildId);
    if (live !== undefined) {
      if (!this.deps.policy.userAllowed(line.userId)) {
        live.call?.note(`[Transcript] ${describePerson(line.person)}: ${line.text}`);
      }
      return;
    }
    const wokeAt = this.typedWakes.get(line.userId);
    if (wokeAt === undefined) {
      this.lastLines.set(line.userId, { line, at: this.deps.now() });
      return;
    }
    if (Date.parse(line.at) <= wokeAt && this.deps.now() - wokeAt <= TYPED_WAKE_MS) {
      this.typedWakes.delete(line.userId);
      this.deps.typed(session, line.person, line.text);
    }
  }

  private wakeTyped(session: CallSession, userId: string): void {
    const now = this.deps.now();
    const last = this.lastLines.get(userId);
    if (last !== undefined && now - last.at <= TYPED_LAG_MS) {
      this.lastLines.delete(userId);
      this.deps.typed(session, last.line.person, last.line.text);
      return;
    }
    this.typedWakes.set(userId, now);
  }

  async say(session: CallSession, speakerId: string, text: string): Promise<boolean> {
    if (!this.speaks(session)) {
      await this.deps.typeInCall(session, text);
      return false;
    }
    const live = this.lives.get(session.guildId);
    if (live === undefined) {
      await this.engage(session, { speakerId, opening: `${SAY_NOW} ${text}` });
    } else {
      live.say(text);
    }
    return true;
  }

  async end(guildId: string): Promise<void> {
    const live = this.lives.get(guildId);
    this.lives.delete(guildId);
    await live?.end();
    this.deps.changed();
  }

  private async engage(session: CallSession, engagement: Engagement): Promise<void> {
    const live = new Live(this.deps.now());
    this.lives.set(session.guildId, live);
    this.deps.changed();
    engagement.onSuperseded?.(() => {
      live.replaced = true;
      if (this.lives.get(session.guildId) === live) {
        this.end(session.guildId).catch(this.deps.report);
      }
    });
    try {
      live.opened(await this.host(session, live, engagement));
      if (live.replaced) {
        await live.end();
      }
    } catch (cause) {
      this.finished(session.guildId, live);
      throw cause;
    }
  }

  private host(session: CallSession, live: Live, engagement: Engagement): Promise<Hosted> {
    const { speakerId, opening, words } = engagement;
    const name = session.channelName ?? session.channelId;
    return this.deps.voice.host({
      title: `${CALL_TITLE_PREFIX}${name}`.slice(0, 80),
      label: `Discord · #${name}`.slice(0, 80),
      speaker: speakerId,
      place: this.deps.place(session),
      opening,
      play: (packet): void => {
        session.link.play(packet);
      },
      closed: (): void => {
        this.finished(session.guildId, live);
      },
      said: (text): void => {
        this.deps.botLine(session, text);
      },
      ...(words === undefined ? {} : { heard: words }),
      listening: {
        echoFree: true,
        idleSeconds: this.deps.settings.voice_idle_seconds,
        pauseMs: this.deps.settings.voice_pause_ms,
      },
    });
  }

  private finished(guildId: string, live: Live): void {
    live.mixer.stop();
    if (this.lives.get(guildId) === live) {
      this.lives.delete(guildId);
      this.deps.changed();
    }
  }
}
