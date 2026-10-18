import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaResolution, type FunctionDeclaration, type LiveServerMessage } from '@google/genai';
import { ASSISTANT_VOICE_SETTINGS, type AssistantVoiceSettings } from '@smarteverything/domain';
import type { CallLink } from '../../src/assistant-voice/call-link';
import { Conversation } from '../../src/assistant-voice/conversation';
import { plainLine } from '../../src/assistant-voice/voice-line';
import type { ConversationHooks } from '../../src/assistant-voice/conversation-hooks';
import { NO_REPLY_MS } from '../../src/assistant-voice/reply-watchdog';
import type { ToolAnswer } from '../../src/assistant-voice/tool-answer';
import {
  done,
  drop,
  fakeGemini,
  goAway,
  heard,
  saved,
  say,
  toolCall,
  type Socket,
} from '../support/fake-gemini';
import { captureLogs, type CapturedLogs } from '../support/logs';

const SCREEN: ToolAnswer = {
  response: { result: 'a settings page' },
  line: 'Looked at the phone screen',
  pictures: [{ data: Buffer.from('jpeg'), mimeType: 'image/jpeg' }],
};

interface Call {
  readonly conversation: Conversation;
  readonly sockets: Socket[];
  readonly endings: string[];
  readonly answer: (value: ToolAnswer) => void;
  readonly advance: (ms: number) => Promise<void>;
  readonly serve: (index: number, ...messages: LiveServerMessage[]) => Promise<void>;
}

let logs: CapturedLogs;

beforeEach(() => {
  vi.useFakeTimers();
  logs = captureLogs();
});

afterEach(() => {
  vi.useRealTimers();
});

async function startCall(): Promise<Call> {
  let clock = 0;
  const sockets: Socket[] = [];
  const endings: string[] = [];
  let answer: (value: ToolAnswer) => void = () => undefined;
  const link: CallLink = {
    audio: () => undefined,
    cut: () => undefined,
    playing: () => false,
    state: () => undefined,
    caption: () => undefined,
  };
  const hooks: ConversationHooks = {
    speech: 'gated-client',
    settings: (): AssistantVoiceSettings => ASSISTANT_VOICE_SETTINGS.parse({}),
    system: (): string => 'system',
    note: (): string => '',
    history: (): string[] => [],
    tools: (): FunctionDeclaration[] => [{ name: 'see', description: 'Look at what they show' }],
    webSearch: (): boolean => false,
    window: (): null => null,
    record: (): void => undefined,
    task: (): string => 'event',
    run: (): Promise<ToolAnswer> =>
      new Promise((resolve) => {
        answer = resolve;
      }),
    ended: (reason, detail): void => {
      endings.push(`${reason}: ${String(detail)}`);
    },
    usage: (): void => undefined,
    measured: (): void => undefined,
    stalled: (): void => undefined,
    staysOpenWhenQuiet: (): boolean => true,
    callId: (): string => 'call-1',
  };
  const conversation = new Conversation(plainLine(fakeGemini(sockets)), link, hooks, () => clock);
  await conversation.start(null);
  const advance = async (ms: number): Promise<void> => {
    clock += ms;
    await vi.advanceTimersByTimeAsync(ms);
  };
  const serve = async (index: number, ...messages: LiveServerMessage[]): Promise<void> => {
    for (const each of messages) {
      sockets[index]?.callbacks.onmessage(each);
    }
    await advance(0);
  };
  return {
    conversation,
    sockets,
    endings,
    answer: (value): void => {
      answer(value);
    },
    advance,
    serve,
  };
}

function speak(conversation: Conversation): void {
  conversation.activity(true);
  conversation.hear(new Int16Array(320));
  conversation.activity(false);
}

function payloadOf(event: string): Readonly<Record<string, unknown>> | undefined {
  return logs.records.find((record) => record.event === event)?.payload;
}

describe('Gemini Live renewal', () => {
  it('waits for the answer to a look before reopening for the new sight tuning', async () => {
    const call = await startCall();
    await call.serve(0, saved('before-look'));
    speak(call.conversation);
    await call.serve(0, heard('what is on my screen'), toolCall('look-1', 'see'));
    call.conversation.tune({ mode: 'live', resolution: 'medium', memorySeconds: 30 });
    await call.serve(0, say);
    call.answer(SCREEN);
    await call.advance(0);
    await call.serve(0, say, done, saved('after-progress'));
    await call.advance(2000);
    expect(call.sockets).toHaveLength(1);
    expect(call.sockets[0]?.sent.some((line) => line.includes('look-1'))).toBe(true);
    await call.serve(0, saved(null), say, done);
    await call.advance(2000);
    expect(call.sockets).toHaveLength(1);
    await call.serve(0, saved('after-answer'));
    await call.advance(200);
    expect(call.sockets).toHaveLength(2);
    expect(call.sockets[1]?.config.sessionResumption).toEqual({ handle: 'after-answer' });
    expect(call.sockets[1]?.config.mediaResolution).toBe(MediaResolution.MEDIA_RESOLUTION_MEDIUM);
    expect(call.sockets[1]?.sent).toEqual([]);
    expect(payloadOf('conversation.renewing')).toMatchObject({ reason: 'tuning', current: true });
    expect(call.endings).toEqual([]);
  });

  it('replays the tool result a dropped session lost and asks the new session to answer', async () => {
    const call = await startCall();
    await call.serve(0, saved('before-look'));
    speak(call.conversation);
    await call.serve(0, heard('look at my screen'), toolCall('look-1', 'see'));
    call.answer(SCREEN);
    await call.advance(0);
    drop(call.sockets[0] ?? fail(), 1000, '');
    await call.advance(0);
    expect(call.sockets).toHaveLength(2);
    expect(call.sockets[1]?.config.sessionResumption).toEqual({ handle: 'before-look' });
    const sent = call.sockets[1]?.sent ?? [];
    expect(sent[0]).toBe('realtime video');
    expect(sent[1]).toContain('see returned {\\"result\\":\\"a settings page\\"}');
    expect(sent[1]).toContain('answer them now');
    expect(sent[1]).toContain('"turnComplete":true');
    expect(payloadOf('conversation.renewing')).toMatchObject({
      reason: 'dropped',
      closeCode: 1000,
      resumed: true,
      current: false,
      owed: true,
    });
    await call.serve(1, say);
    expect(payloadOf('conversation.renew_answered')).toMatchObject({
      reason: 'dropped',
      resumed: true,
    });
  });

  it('answers a tool that finishes after the renewal as a note, not with the old call id', async () => {
    const call = await startCall();
    await call.serve(0, saved('h1'), toolCall('look-1', 'see'));
    drop(call.sockets[0] ?? fail(), 1000, '');
    await call.advance(0);
    call.answer(SCREEN);
    await call.advance(0);
    const sent = call.sockets[1]?.sent ?? [];
    expect(sent.some((line) => line.startsWith('tool '))).toBe(false);
    expect(sent.at(-1)).toContain('[see, which you called before your connection was renewed');
    expect(sent.at(-1)).toContain('"turnComplete":true');
  });

  it('forwards speech that starts during the renewal to the new session with its activity', async () => {
    const call = await startCall();
    await call.serve(0, saved('h1'), say, done);
    call.conversation.activity(true);
    drop(call.sockets[0] ?? fail(), 1000, '');
    call.conversation.hear(new Int16Array(320));
    call.conversation.activity(false);
    await call.advance(0);
    expect(call.sockets[1]?.sent).toEqual([
      'realtime activityStart',
      'realtime audio',
      'realtime activityEnd',
    ]);
  });

  it('replaces a resumed session that never answers with a fresh one carrying the call', async () => {
    const call = await startCall();
    await call.serve(0, heard('hello'), say, done, saved('h1'));
    drop(call.sockets[0] ?? fail(), 1000, '');
    await call.advance(0);
    await call.serve(1, saved('h2'));
    speak(call.conversation);
    await call.serve(1, heard('are you there'));
    await call.advance(NO_REPLY_MS + 200);
    expect(call.sockets).toHaveLength(3);
    expect(call.sockets[2]?.config.sessionResumption).toEqual({});
    const catchUp = call.sockets[2]?.sent.find((line) => line.startsWith('text ')) ?? '';
    expect(catchUp).toContain('They said: hello');
    expect(catchUp).toContain('They said: are you there');
    expect(catchUp).toContain('"turnComplete":true');
    expect(logs.events()).toContain('conversation.renew_silent');
    expect(call.endings).toEqual([]);
  });

  it('starts a fresh session when the server rejects the resumed one', async () => {
    const call = await startCall();
    await call.serve(0, heard('turn on the lights'), say, done, saved('expired'));
    drop(call.sockets[0] ?? fail(), 1000, '');
    await call.advance(0);
    drop(call.sockets[1] ?? fail(), 1008, 'BidiGenerateContent session not found or expired');
    await call.advance(0);
    expect(call.sockets).toHaveLength(3);
    expect(call.sockets[2]?.config.sessionResumption).toEqual({});
    expect(call.sockets[2]?.sent[0]).toContain('They said: turn on the lights');
    expect(call.endings).toEqual([]);
    drop(call.sockets[2] ?? fail(), 1011, 'internal');
    await call.advance(0);
    expect(call.endings).toEqual(['failed: internal']);
  });

  it('renews at the next saved point after Gemini says it will go away', async () => {
    const call = await startCall();
    await call.serve(0, say, done, saved('h1'), goAway('30s'));
    await call.advance(200);
    expect(call.sockets).toHaveLength(2);
    expect(call.sockets[1]?.config.sessionResumption).toEqual({ handle: 'h1' });
    expect(payloadOf('live.go_away')).toMatchObject({ timeLeft: '30s' });
    expect(payloadOf('conversation.renewing')).toMatchObject({ reason: 'go_away' });
  });

  it('ends the call when the first session drops before it ever worked', async () => {
    const call = await startCall();
    drop(call.sockets[0] ?? fail(), 1011, 'internal');
    await call.advance(0);
    expect(call.sockets).toHaveLength(1);
    expect(call.endings).toEqual(['failed: internal']);
  });
});

function fail(): never {
  throw new Error('the fake Gemini socket was not opened');
}
