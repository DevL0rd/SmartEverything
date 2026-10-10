import { describe, expect, it, vi } from 'vitest';
import { ASSISTANT_VOICE_SETTINGS, type AssistantVoiceSettings } from '@smarteverything/domain';
import type { CallLink } from '../../src/assistant-voice/call-link';
import { Conversation, REPLY_GRACE_MS } from '../../src/assistant-voice/conversation';
import type { LiveSession, VoiceProvider } from '../../src/assistant-voice/gemini';
import { LiveConnectTimeoutError, connectWithin } from '../../src/assistant-voice/live-connect';
import {
  LONGEST_TURN_MS,
  NO_REPLY_MS,
  ReplyWatchdog,
} from '../../src/assistant-voice/reply-watchdog';
import { deliverToolAnswer } from '../../src/assistant-voice/tool-delivery';

function recordingSession(log: string[]): LiveSession {
  return {
    audio: (): void => undefined,
    speaking: (speaking): void => {
      log.push(`speaking ${String(speaking)}`);
    },
    text: (text, respond): void => {
      log.push(`text ${text} respond=${String(respond)}`);
    },
    picture: (picture): void => {
      log.push(`picture ${picture.mimeType}`);
    },
    toolResult: (_id, name, response): void => {
      log.push(`result ${name} ${JSON.stringify(response)}`);
    },
    video: (): void => undefined,
    close: (): void => {
      log.push('closed');
    },
  };
}

describe('ReplyWatchdog', () => {
  it('nudges once after silence, then gives up', () => {
    const watchdog = new ReplyWatchdog();
    watchdog.turnStarted(0);
    watchdog.turnEnded(1000);
    expect(watchdog.check(1000 + NO_REPLY_MS - 1)).toBeNull();
    expect(watchdog.check(1000 + NO_REPLY_MS)).toBe('nudge');
    expect(watchdog.check(1000 + NO_REPLY_MS * 2 - 1)).toBeNull();
    expect(watchdog.check(1000 + NO_REPLY_MS * 2)).toBe('give_up');
    expect(watchdog.check(1000 + NO_REPLY_MS * 5)).toBeNull();
  });

  it('is satisfied by any reply', () => {
    const watchdog = new ReplyWatchdog();
    watchdog.turnEnded(0);
    watchdog.replied();
    expect(watchdog.check(NO_REPLY_MS * 3)).toBeNull();
  });

  it('ends a turn that never stops', () => {
    const watchdog = new ReplyWatchdog();
    watchdog.turnStarted(0);
    expect(watchdog.check(LONGEST_TURN_MS + 1)).toBe('end_turn');
    expect(watchdog.check(LONGEST_TURN_MS + 2)).toBeNull();
  });
});

describe('deliverToolAnswer', () => {
  it('sends the photo before the tool result so the AI answers with it', () => {
    const log: string[] = [];
    const turns: string[] = [];
    deliverToolAnswer(
      {
        session: recordingSession(log),
        record: (turn) => {
          turns.push(turn.text);
        },
        scheduling: 'idle',
      },
      { id: 'call-1', name: 'take_camera_snapshots' },
      {
        response: { result: { cameras: [] } },
        line: 'Looked through the living room camera',
        pictures: [{ data: Buffer.from('jpeg'), mimeType: 'image/jpeg' }],
      },
    );
    expect(log[0]).toBe('picture image/jpeg');
    expect(log[1]).toMatch(/^result take_camera_snapshots .*"photos":"Look at the picture sent/);
    expect(log).toHaveLength(2);
    expect(turns).toEqual(['Looked through the living room camera']);
  });

  it('sends a plain result when there is no picture', () => {
    const log: string[] = [];
    deliverToolAnswer(
      { session: recordingSession(log), record: () => undefined, scheduling: 'idle' },
      { id: 'c', name: 'get_weather' },
      {
        response: { result: 'sunny' },
        line: '',
        pictures: [],
      },
    );
    expect(log).toEqual(['result get_weather {"result":"sunny"}']);
  });
});

describe('connectWithin', () => {
  it('fails visibly when Gemini never answers, and closes a late session', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    let open: (session: LiveSession) => void = () => undefined;
    const pending = connectWithin(
      new Promise<LiveSession>((resolve) => {
        open = resolve;
      }),
      1000,
    );
    vi.advanceTimersByTime(1000);
    await expect(pending).rejects.toBeInstanceOf(LiveConnectTimeoutError);
    open(recordingSession(log));
    await vi.runAllTimersAsync();
    expect(log).toEqual(['closed']);
    vi.useRealTimers();
  });

  it('passes a session that connects in time', async () => {
    const session = recordingSession([]);
    await expect(connectWithin(Promise.resolve(session), 1000)).resolves.toBe(session);
  });
});

describe('Conversation watchdog', () => {
  it.each([false, true])(
    'nudges Gemini once, then gives up (stays open: %s)',
    async (staysOpen) => {
      vi.useFakeTimers();
      let clock = 0;
      const log: string[] = [];
      const endings: string[] = [];
      const stalls: string[] = [];
      const provider: VoiceProvider = { live: () => Promise.resolve(recordingSession(log)) };
      const link: CallLink = {
        audio: () => undefined,
        cut: () => undefined,
        playing: () => false,
        state: () => undefined,
        caption: () => undefined,
      };
      const conversation = new Conversation(
        provider,
        link,
        {
          speech: 'gated-client',
          settings: (): AssistantVoiceSettings => ASSISTANT_VOICE_SETTINGS.parse({}),
          system: (): string => 'system',
          tools: (): [] => [],
          webSearch: (): boolean => false,
          window: (): null => null,
          record: (): void => undefined,
          task: (): string => 'event',
          run: (): Promise<never> => Promise.reject(new Error('no tools here')),
          ended: (reason, detail): void => {
            endings.push(`${reason}: ${String(detail)}`);
          },
          usage: (): void => undefined,
          measured: (): void => undefined,
          stalled: (step): void => {
            stalls.push(step);
          },
          staysOpenWhenQuiet: (): boolean => staysOpen,
        },
        () => clock,
      );
      await conversation.start(null);
      conversation.activity(true);
      conversation.hear(new Int16Array(320));
      conversation.activity(false);
      const advance = async (ms: number): Promise<void> => {
        clock += ms;
        await vi.advanceTimersByTimeAsync(ms);
      };
      await advance(NO_REPLY_MS + 200);
      expect(stalls).toEqual(['nudged']);
      expect(log.filter((line) => line.startsWith('text ['))).toHaveLength(1);
      await advance(NO_REPLY_MS + 200);
      expect(stalls).toEqual(['nudged', 'gave_up']);
      await advance(60_000);
      expect(endings).toEqual(staysOpen ? [] : ['failed: The AI stopped answering; call again.']);
      vi.useRealTimers();
    },
  );
});

describe('Conversation idle timeout', () => {
  async function idleRun(
    inFlight: boolean,
  ): Promise<{ endings: string[]; advance: (ms: number) => Promise<void> }> {
    vi.useFakeTimers();
    let clock = 0;
    const endings: string[] = [];
    let toolCall: () => void = () => undefined;
    const provider: VoiceProvider = {
      live: (_options, events) => {
        toolCall = (): void => {
          events.tool('t', 'get_home', {});
        };
        return Promise.resolve(recordingSession([]));
      },
    };
    let playing = true;
    const link: CallLink = {
      audio: () => undefined,
      cut: () => undefined,
      playing: () => playing,
      state: () => undefined,
      caption: () => undefined,
    };
    let release: (value: never) => void = () => undefined;
    const conversation = new Conversation(
      provider,
      link,
      {
        speech: 'gated-client',
        settings: (): AssistantVoiceSettings => ASSISTANT_VOICE_SETTINGS.parse({}),
        system: (): string => 'system',
        tools: (): [] => [],
        webSearch: (): boolean => false,
        window: (): null => null,
        record: (): void => undefined,
        task: (): string => 'event',
        run: (): Promise<never> =>
          new Promise((resolve) => {
            release = resolve;
          }),
        ended: (reason): void => {
          endings.push(reason);
        },
        usage: (): void => undefined,
        measured: (): void => undefined,
        stalled: (): void => undefined,
        staysOpenWhenQuiet: (): boolean => false,
      },
      () => clock,
    );
    await conversation.start(null);
    const advance = async (ms: number): Promise<void> => {
      clock += ms;
      await vi.advanceTimersByTimeAsync(ms);
    };
    await advance(200);
    if (inFlight) {
      toolCall();
    }
    playing = false;
    void release;
    return { endings, advance };
  }

  it('waits a grace period after the AI stops speaking before ending as idle', async () => {
    const { endings, advance } = await idleRun(false);
    await advance(6000);
    expect(endings).toEqual([]);
    await advance(REPLY_GRACE_MS);
    expect(endings).toEqual(['idle']);
    vi.useRealTimers();
  });

  it('never ends as idle while a tool call is running', async () => {
    const { endings, advance } = await idleRun(true);
    await advance(120_000);
    expect(endings).toEqual([]);
    vi.useRealTimers();
  });
});
