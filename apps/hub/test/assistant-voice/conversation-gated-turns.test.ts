import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_VOICE_SETTINGS,
  AUTOMATIC_HANGOVER_MS,
  type AssistantVoiceSettings,
} from '@smarteverything/domain';
import type { CallLink } from '../../src/assistant-voice/call-link';
import { Conversation } from '../../src/assistant-voice/conversation';
import {
  liveSessionOf,
  type LiveEvents,
  type LiveWire,
  type VoiceProvider,
} from '../../src/assistant-voice/gemini';
import type { SpeechPause } from '../../src/assistant-voice/speech-input';
import { plainLine } from '../../src/assistant-voice/voice-line';

const SAMPLES_PER_MS = 16;
const GEMINI_END_OF_SPEECH_MS = AUTOMATIC_HANGOVER_MS + 500;
const QUESTION = 'what time is it';
const ANSWER = 'it is nine';
const REPLY_MS = 400;
const ANSWERED = [`person: ${QUESTION}`, 'ai audio', `assistant: ${ANSWER}`];

class FakeGemini {
  automatic = false;
  events: LiveEvents | null = null;
  private speech = false;
  private quietMs = 0;
  private answering = false;
  private streamEnded = false;

  readonly wire: LiveWire = {
    sendRealtimeInput: (params): void => {
      if (params.activityStart !== undefined) {
        this.speech = true;
      }
      if (params.activityEnd !== undefined && this.speech) {
        this.answer();
      }
      this.streamEnded ||= params.audioStreamEnd === true;
      const data = params.audio?.data;
      if (data !== undefined && this.automatic) {
        this.hear(data);
      }
    },
    sendClientContent: (): void => undefined,
    sendToolResponse: (): void => undefined,
    close: (): void => undefined,
  };

  private hear(data: string): void {
    const bytes = Buffer.from(data, 'base64');
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    if (this.streamEnded) {
      this.streamEnded = false;
      if (this.speech && samples.some((sample) => sample !== 0)) {
        this.answer();
      }
    }
    samples.forEach((sample) => {
      this.detect(sample);
    });
  }

  private detect(sample: number): void {
    if (sample !== 0) {
      if (this.answering) {
        this.answering = false;
        this.events?.interrupted();
      }
      this.speech = true;
      this.quietMs = 0;
    } else if (this.speech) {
      this.quietMs += 1 / SAMPLES_PER_MS;
      if (this.quietMs >= GEMINI_END_OF_SPEECH_MS) {
        this.answer();
      }
    }
  }

  private answer(): void {
    this.speech = false;
    this.quietMs = 0;
    this.answering = true;
    this.events?.heard(QUESTION);
    this.events?.audio(new Int16Array(24 * REPLY_MS));
    this.events?.said(ANSWER);
    setTimeout(() => {
      if (this.answering) {
        this.answering = false;
        this.events?.turnComplete();
      }
    }, REPLY_MS);
  }
}

function pauseOf(ms: 0 | 640): SpeechPause {
  return { ms: () => ms, onChange: () => (): void => undefined };
}

function voice(ms: number): Int16Array {
  return Int16Array.from({ length: SAMPLES_PER_MS * ms }, (_, index) =>
    index % 2 === 0 ? 6000 : -6000,
  );
}

interface CallLog {
  readonly lines: string[];
  readonly link: CallLink;
}

function callLog(): CallLog {
  const lines: string[] = [];
  return {
    lines,
    link: {
      audio: (frames): void => {
        if (frames.length > 0 && lines.at(-1) !== 'ai audio') {
          lines.push('ai audio');
        }
      },
      cut: (): void => {
        lines.push('ai audio cut');
      },
      playing: () => false,
      state: () => undefined,
      caption: (who, text): void => {
        lines.push(`${who}: ${text}`);
      },
    },
  };
}

async function phoneCall(pauseMs: 0 | 640): Promise<{ conversation: Conversation; log: CallLog }> {
  vi.useFakeTimers();
  const gemini = new FakeGemini();
  const provider: VoiceProvider = {
    live: (options, events) => {
      gemini.automatic = options.automatic;
      gemini.events = events;
      return Promise.resolve(liveSessionOf(gemini.wire, options.automatic));
    },
  };
  const log = callLog();
  const conversation = new Conversation(plainLine(provider), log.link, {
    speech: 'gated-client',
    pause: pauseOf(pauseMs),
    settings: (): AssistantVoiceSettings => ASSISTANT_VOICE_SETTINGS.parse({}),
    system: (): string => 'system',
    note: (): string => '',
    history: (): string[] => [],
    tools: (): [] => [],
    webSearch: (): boolean => false,
    window: (): null => null,
    record: (): void => undefined,
    task: (): string => 'event',
    run: (): Promise<never> => Promise.reject(new Error('no tools here')),
    ended: (): void => undefined,
    usage: (): void => undefined,
    measured: (): void => undefined,
    stalled: (): void => undefined,
    staysOpenWhenQuiet: (): boolean => true,
  });
  await conversation.start(null);
  return { conversation, log };
}

function speakThroughPhoneGate(conversation: Conversation, hangoverMs: number): void {
  conversation.activity(true);
  conversation.hear(voice(1200));
  conversation.hear(new Int16Array(SAMPLES_PER_MS * hangoverMs));
  conversation.activity(false);
}

describe('a phone call whose gate sends speech only while the person talks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers when the person stops, not only when they speak again, when Gemini decides the turn end', async () => {
    const { conversation, log } = await phoneCall(0);
    speakThroughPhoneGate(conversation, AUTOMATIC_HANGOVER_MS);
    await vi.advanceTimersByTimeAsync(20_000);
    const beforeSpeakingAgain = [...log.lines];
    conversation.activity(true);
    conversation.hear(voice(300));
    expect({ beforeSpeakingAgain, afterSpeakingAgain: log.lines }).toEqual({
      beforeSpeakingAgain: ANSWERED,
      afterSpeakingAgain: ANSWERED,
    });
    await conversation.end('hung_up');
  });

  it('gets the answer as soon as the person stops, when the gate decides the turn end', async () => {
    const { conversation, log } = await phoneCall(640);
    speakThroughPhoneGate(conversation, 640);
    expect(log.lines).toEqual(ANSWERED);
    await conversation.end('hung_up');
  });
});
