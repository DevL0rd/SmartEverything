import { describe, expect, it, vi } from 'vitest';
import { ASSISTANT_VOICE_SETTINGS, type AssistantVoiceSettings } from '@smarteverything/domain';
import type { CallLink } from '../../src/assistant-voice/call-link';
import { Conversation } from '../../src/assistant-voice/conversation';
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
    text: (text, respond, image): void => {
      log.push(`text ${text} respond=${String(respond)} image=${String(image !== undefined)}`);
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
      recordingSession(log),
      (turn) => {
        turns.push(turn.text);
      },
      { id: 'call-1', name: 'take_camera_snapshots' },
      {
        response: { result: { cameras: [] } },
        line: 'Looked through the living room camera',
        pictures: [{ data: Buffer.from('jpeg'), mimeType: 'image/jpeg' }],
      },
    );
    expect(log[0]).toBe('text [Photo from take_camera_snapshots] respond=false image=true');
    expect(log[1]).toMatch(/^result take_camera_snapshots .*"photos":"Look at the \[Photo\]/);
    expect(turns).toEqual(['Looked through the living room camera']);
  });

  it('sends a plain result when there is no picture', () => {
    const log: string[] = [];
    deliverToolAnswer(
      recordingSession(log),
      () => undefined,
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
  it('nudges Gemini once, then ends the call when it never answers', async () => {
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
        window: (): null => null,
        record: (): void => undefined,
        task: (): string => 'event',
        run: (): Promise<never> => Promise.reject(new Error('no tools here')),
        ended: (reason, detail): void => {
          endings.push(`${reason}: ${String(detail)}`);
        },
        usage: (): void => undefined,
        stalled: (step): void => {
          stalls.push(step);
        },
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
    expect(endings).toEqual(['failed: The AI stopped answering; call again.']);
    vi.useRealTimers();
  });
});
