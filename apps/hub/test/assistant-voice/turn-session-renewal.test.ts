import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveServerMessage } from '@google/genai';
import { DEFAULT_ENGINE, NO_PRICES } from '@smarteverything/domain';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import type { ToolAnswer } from '../../src/assistant-voice/tool-answer';
import { TurnSessions, type TurnRequest } from '../../src/assistant-voice/turn-sessions';
import type { TurnSession } from '../../src/assistant-voice/turn-session';
import {
  done,
  drop,
  fakeGemini,
  goAway,
  heard,
  said,
  saved,
  say,
  socketAt,
  toolCall,
  type Socket,
} from '../support/fake-gemini';
import { captureLogs, type CapturedLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const LOOK: ToolAnswer = {
  response: { result: 'a settings page' },
  line: 'Looked at the screen',
  pictures: [{ data: Buffer.from('jpeg'), mimeType: 'image/jpeg' }],
};

let opened: TestStore;
let chatId: string;
let logs: CapturedLogs;

beforeEach(async () => {
  opened = await testStore();
  chatId = opened.store.aiChats.create({
    profileId: opened.store.profiles.first().id,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  }).id;
  logs = captureLogs();
  vi.useFakeTimers();
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

interface Turn {
  readonly session: TurnSession;
  readonly sockets: Socket[];
  readonly endings: string[];
  readonly answer: (value: ToolAnswer) => void;
  readonly serve: (index: number, ...messages: LiveServerMessage[]) => Promise<void>;
}

async function openTurn(): Promise<Turn> {
  const sockets: Socket[] = [];
  const endings: string[] = [];
  let answer: (value: ToolAnswer) => void = () => undefined;
  const turns = new TurnSessions({
    store: opened.store,
    provider: fakeGemini(sockets),
    responder: {
      ready: (): null => null,
      chatForCall: (): string => chatId,
      request: (): string => 'event-1',
      callEnded: (): void => undefined,
    },
    tools: new ToolHub([]),
    prices: { priceOf: (): typeof NO_PRICES => NO_PRICES },
    now: (): Date => new Date('2026-10-10T10:00:00.000Z'),
    log: testLogger('turns'),
  });
  const request: TurnRequest = {
    pluginId: 'plugin',
    caller: { profileId: opened.store.profiles.first().id, role: 'owner', label: 'Robot' },
    chatId,
    place: 'You are a robot.',
    speaking: { hiddenTools: new Set() },
    bare: true,
    tools: [
      {
        name: 'look',
        description: 'Look at the screen.',
        parameters: {},
        delivery: 'idle',
        run: () =>
          new Promise<ToolAnswer>((resolve) => {
            answer = resolve;
          }),
      },
    ],
    opening: null,
    events: {
      audio: (): void => undefined,
      heard: (): void => undefined,
      said: (): void => undefined,
      interrupted: (): void => undefined,
      turnComplete: (): void => undefined,
      ended: (reason, detail): void => {
        endings.push(`${reason}: ${String(detail)}`);
      },
    },
  };
  const session = await turns.open(request);
  const serve = async (index: number, ...messages: LiveServerMessage[]): Promise<void> => {
    for (const each of messages) {
      socketAt(sockets, index).callbacks.onmessage(each);
    }
    await vi.advanceTimersByTimeAsync(0);
  };
  return {
    session,
    sockets,
    endings,
    answer: (value): void => {
      answer(value);
    },
    serve,
  };
}

function ask(turn: Turn): void {
  turn.session.begin();
  turn.session.hear(new Int16Array(320));
  turn.session.finish();
}

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('plugin turn session renewal', () => {
  it('keeps one session open while a tool runs and answers it on the same session', async () => {
    const turn = await openTurn();
    await turn.serve(0, saved('h1'));
    ask(turn);
    await turn.serve(0, heard('look'), toolCall('look-1', 'look'));
    turn.answer(LOOK);
    await settle();
    await turn.serve(0, say, done, saved('h2'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(turn.sockets).toHaveLength(1);
    expect(socketAt(turn.sockets, 0).sent.some((line) => line.includes('look-1'))).toBe(true);
    expect(turn.endings).toEqual([]);
  });

  it('replays the tool result a dropped session lost and asks the new session to answer', async () => {
    const turn = await openTurn();
    await turn.serve(0, saved('before-look'));
    ask(turn);
    await turn.serve(0, heard('look at the screen'), toolCall('look-1', 'look'));
    turn.answer(LOOK);
    await settle();
    drop(socketAt(turn.sockets, 0), 1000, '');
    await settle();
    expect(turn.sockets).toHaveLength(2);
    expect(socketAt(turn.sockets, 1).config.sessionResumption).toEqual({ handle: 'before-look' });
    const sent = socketAt(turn.sockets, 1).sent;
    expect(sent[0]).toBe('realtime video');
    expect(sent[1]).toContain('look returned {\\"result\\":\\"a settings page\\"}');
    expect(sent[1]).toContain('"turnComplete":true');
    expect(logs.events()).toContain('conversation.renewing');
    await turn.serve(1, say);
    expect(logs.events()).toContain('conversation.renew_answered');
  });

  it('delivers a tool that finishes after the renewal as a note, not with the old call id', async () => {
    const turn = await openTurn();
    await turn.serve(0, saved('h1'), toolCall('look-1', 'look'));
    drop(socketAt(turn.sockets, 0), 1000, '');
    await settle();
    turn.answer(LOOK);
    await settle();
    const sent = socketAt(turn.sockets, 1).sent;
    expect(sent.some((line) => line.startsWith('tool '))).toBe(false);
    expect(sent.at(-1)).toContain('[look, which you called before your connection was renewed');
  });

  it('forwards speech that starts during the renewal with its activity', async () => {
    const turn = await openTurn();
    await turn.serve(0, say, done, saved('h1'));
    turn.session.begin();
    drop(socketAt(turn.sockets, 0), 1000, '');
    turn.session.hear(new Int16Array(320));
    turn.session.finish();
    await settle();
    expect(socketAt(turn.sockets, 1).sent).toEqual([
      'realtime activityStart',
      'realtime audio',
      'realtime activityEnd',
    ]);
  });

  it('starts a fresh session with the transcript when the server rejects the resumed one', async () => {
    const turn = await openTurn();
    ask(turn);
    await turn.serve(0, heard('turn on the lights'), said('Done.'), done, saved('expired'));
    drop(socketAt(turn.sockets, 0), 1000, '');
    await settle();
    drop(socketAt(turn.sockets, 1), 1008, 'BidiGenerateContent session not found or expired');
    await settle();
    expect(turn.sockets).toHaveLength(3);
    expect(socketAt(turn.sockets, 2).config.sessionResumption).toEqual({});
    const catchUp = socketAt(turn.sockets, 2).sent[0] ?? '';
    expect(catchUp).toContain('They said: turn on the lights');
    expect(catchUp).toContain('You said: Done.');
    expect(turn.endings).toEqual([]);
    drop(socketAt(turn.sockets, 2), 1011, 'internal');
    await settle();
    expect(turn.endings).toEqual(['failed: internal']);
  });

  it('renews a second drop too instead of ending after one resume', async () => {
    const turn = await openTurn();
    await turn.serve(0, say, done, saved('h1'));
    drop(socketAt(turn.sockets, 0), 1000, '');
    await settle();
    await turn.serve(1, say, done, saved('h2'));
    drop(socketAt(turn.sockets, 1), 1000, '');
    await settle();
    expect(turn.sockets).toHaveLength(3);
    expect(socketAt(turn.sockets, 2).config.sessionResumption).toEqual({ handle: 'h2' });
    expect(turn.endings).toEqual([]);
  });

  it('renews at the next saved point after Gemini says it will go away', async () => {
    const turn = await openTurn();
    await turn.serve(0, say, done, saved('h1'), goAway('30s'));
    await settle();
    expect(turn.sockets).toHaveLength(2);
    expect(socketAt(turn.sockets, 1).config.sessionResumption).toEqual({ handle: 'h1' });
    expect(
      logs.records.find((record) => record.event === 'conversation.renewing')?.payload,
    ).toMatchObject({
      reason: 'go_away',
    });
  });

  it('does not renew for a go-away while the assistant is still talking', async () => {
    const turn = await openTurn();
    await turn.serve(0, say, goAway('30s'), saved('h1'));
    await settle();
    expect(turn.sockets).toHaveLength(1);
    await turn.serve(0, done, saved('h2'));
    expect(turn.sockets).toHaveLength(2);
    expect(socketAt(turn.sockets, 1).config.sessionResumption).toEqual({ handle: 'h2' });
  });

  it('replaces a stalled session with a fresh one that carries the turn', async () => {
    const turn = await openTurn();
    ask(turn);
    await turn.serve(0, heard('hello'), saved('h1'));
    await turn.session.reopen();
    await settle();
    expect(turn.sockets).toHaveLength(2);
    expect(socketAt(turn.sockets, 1).config.sessionResumption).toEqual({});
    expect(socketAt(turn.sockets, 1).sent.join('\n')).toContain('"turnComplete":true');
    expect(turn.endings).toEqual([]);
  });

  it('ends the turn when the first session drops before it ever worked', async () => {
    const turn = await openTurn();
    drop(socketAt(turn.sockets, 0), 1011, 'internal');
    await settle();
    expect(turn.sockets).toHaveLength(1);
    expect(turn.endings).toEqual(['failed: internal']);
  });
});
