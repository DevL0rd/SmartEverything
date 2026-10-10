import { TRANSCRIPT_TEXT_MAX, type WakeSensitivity } from '@smarteverything/domain';
import { displayName, type Person } from '../person';
import type { PluginVoice } from '../../../plugin-voice';
import { Capture, type CaptureCounts } from './capture';
import type { VoiceLink } from './link';
import { Utterances, type UtteranceCounts, type Utterance } from './utterances';

type Ear = Awaited<ReturnType<PluginVoice['ear']>>;

type Transcript = ReturnType<PluginVoice['transcript']>;

const SILENCE_PAD_SAMPLES = 16_000;
const CONTEXT_LINES = 5;
const CONTEXT_WINDOW_MS = 24 * 60 * 60_000;

export interface HeardLine {
  readonly userId: string;
  readonly person: Person;
  readonly text: string;
  readonly at: string;
}

export interface SessionHooks {
  readonly approved: (userId: string) => boolean;
  readonly captures: (userId: string) => boolean;
  readonly mixes: (userId: string, pcm: Int16Array) => boolean;
  readonly wakeable: (userId: string) => boolean;
  readonly wakeSensitivity: () => WakeSensitivity;
  readonly wakeNames: () => string[];
  readonly wake: (userId: string, phrase: string, words: () => Int16Array) => void;
  readonly heard: (line: HeardLine) => void;
  readonly speaker: (userId: string) => Promise<Person>;
  readonly names: () => string[];
  readonly report: (cause: unknown) => void;
  readonly changed: () => void;
}

interface CallIdentity {
  readonly guildId: string;
  readonly channelId: string;
  readonly channelName: string | null;
  readonly startedAt: string;
}

export interface SessionParts {
  readonly identity: CallIdentity;
  readonly link: VoiceLink;
  readonly transcript: Transcript;
  readonly voice: Pick<PluginVoice, 'ear' | 'transcribe'>;
  readonly language: string;
  readonly hooks: SessionHooks;
  readonly now: () => number;
  readonly lines?: number;
}

export class CallSession {
  readonly id: string;
  private readonly utterances: Utterances;
  private readonly capture: Capture;
  private readonly ears = new Map<string, Promise<Ear>>();
  private closed = false;
  private lines: number;

  constructor(private readonly parts: SessionParts) {
    this.id = parts.transcript.id;
    this.lines = parts.lines ?? 0;
    this.utterances = new Utterances({
      transcribe: (utterance): Promise<void> => this.transcribe(utterance),
      failed: parts.hooks.report,
    });
    this.capture = new Capture({
      link: parts.link,
      utterances: this.utterances,
      shouldCapture: parts.hooks.captures,
      heard: (userId, pcm): void => {
        this.audio(userId, pcm);
      },
      ended: (userId): void => {
        this.flushEar(userId);
      },
      failed: parts.hooks.report,
      now: parts.now,
    });
  }

  get guildId(): string {
    return this.parts.identity.guildId;
  }

  get channelId(): string {
    return this.parts.identity.channelId;
  }

  get channelName(): string | null {
    return this.parts.identity.channelName;
  }

  get startedAt(): string {
    return this.parts.identity.startedAt;
  }

  get lineCount(): number {
    return this.lines;
  }

  get link(): VoiceLink {
    return this.parts.link;
  }

  get transcript(): Transcript {
    return this.parts.transcript;
  }

  start(): void {
    this.capture.start();
  }

  addLine(line: Parameters<Transcript['add']>[0]): void {
    this.parts.transcript.add(line);
    this.lines += 1;
    this.parts.hooks.changed();
  }

  counts(): UtteranceCounts & CaptureCounts {
    return { ...this.utterances.counts(), ...this.capture.counts() };
  }

  dropEar(userId: string): void {
    const ear = this.ears.get(userId);
    this.ears.delete(userId);
    ear?.then((open) => open.close()).catch(this.parts.hooks.report);
  }

  async close(keepTranscript = false): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.capture.close();
    this.utterances.close();
    this.parts.link.destroy();
    await Promise.all(
      [...this.ears.values()].map((ear) =>
        ear.then((open) => open.close()).catch(this.parts.hooks.report),
      ),
    );
    this.ears.clear();
    if (!keepTranscript) {
      this.parts.transcript.close();
    }
  }

  private audio(userId: string, pcm: Int16Array): void {
    const { hooks } = this.parts;
    if (!hooks.approved(userId) || hooks.mixes(userId, pcm)) {
      return;
    }
    if (hooks.wakeable(userId)) {
      this.feed(userId, pcm);
    }
  }

  private flushEar(userId: string): void {
    if (this.ears.has(userId) && this.parts.hooks.wakeable(userId)) {
      this.feed(userId, new Int16Array(SILENCE_PAD_SAMPLES));
    }
  }

  private feed(userId: string, pcm: Int16Array): void {
    this.earOf(userId)
      .then((ear) => {
        ear.hear(pcm);
      })
      .catch(this.parts.hooks.report);
  }

  private earOf(userId: string): Promise<Ear> {
    const existing = this.ears.get(userId);
    if (existing !== undefined) {
      return existing;
    }
    const opening = this.parts.voice.ear({
      speaker: userId,
      sensitivity: this.parts.hooks.wakeSensitivity,
      names: this.parts.hooks.wakeNames,
      wake: (phrase, words): void => {
        this.parts.hooks.wake(userId, phrase, words);
      },
    });
    this.ears.set(userId, opening);
    opening.catch(() => {
      this.ears.delete(userId);
    });
    return opening;
  }

  private async transcribe(utterance: Utterance): Promise<void> {
    const { hooks, voice, language } = this.parts;
    const text = await voice.transcribe({
      pcm16k: utterance.pcm,
      recent: this.recent(),
      names: hooks.names(),
      language,
    });
    if (text === null || this.closed) {
      return;
    }
    const person = await hooks.speaker(utterance.userId);
    const at = new Date(utterance.startedAt).toISOString();
    this.addLine({
      at,
      speakerId: utterance.userId,
      speaker: displayName(person),
      text: text.slice(0, TRANSCRIPT_TEXT_MAX),
      bot: false,
    });
    hooks.heard({ userId: utterance.userId, person, text, at });
  }

  private recent(): string[] {
    return this.parts.transcript
      .recent(CONTEXT_WINDOW_MS, CONTEXT_LINES)
      .map((line) => `${line.speaker}: ${line.text}`);
  }
}
