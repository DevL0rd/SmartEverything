import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENGINE, DEFAULT_RESPONSE_STYLE, NO_PRICES } from '@smarteverything/domain';
import { FORMAT_MANNER, TOOL_MANNER } from '../../src/ai-tools/tool-guide';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { stablePrompt, type PromptFacts } from '../../src/assistant/conversation/prompt';
import { PLAY } from '../../src/assistant/personality';
import type { ToolAnswer } from '../../src/assistant-voice/tool-answer';
import { Conversation } from '../../src/assistant-voice/conversation';
import { plainLine } from '../../src/assistant-voice/voice-line';
import type { CallLink } from '../../src/assistant-voice/call-link';
import { ASSISTANT_VOICE_SETTINGS, type AssistantVoiceSettings } from '@smarteverything/domain';
import { CallDesk } from '../../src/assistant-voice/call-desk';
import type {
  LiveEvents,
  LiveOptions,
  LiveSession,
  VoiceProvider,
} from '../../src/assistant-voice/gemini';
import { liveInstructions, STAYS_OPEN_ENDING } from '../../src/assistant-voice/instructions';
import {
  progressNote,
  trackToolProgress,
  TOOL_PROGRESS_AFTER_MS,
  TOOL_PROGRESS_EVERY_MS,
  type ToolProgressPorts,
} from '../../src/assistant-voice/tool-progress';
import { TurnSessions, type TurnRequest } from '../../src/assistant-voice/turn-sessions';
import { ROBOT_ENDING } from '../../src/plugins/builtin/aibi/place-instructions';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let chatId: string;
let systems: string[];
let notes: string[];
let results: string[];
let events: LiveEvents | null;

const session: LiveSession = {
  audio: (): void => undefined,
  speaking: (): void => undefined,
  text: (text): void => {
    notes.push(text);
  },
  picture: (): void => undefined,
  toolResult: (_id, name): void => {
    results.push(name);
  },
  video: (): void => undefined,
  close: (): void => undefined,
};

const provider: VoiceProvider = {
  live: (options: LiveOptions, live: LiveEvents) => {
    systems.push(options.system);
    events = live;
    return Promise.resolve(session);
  },
};

function ports(over: Partial<ToolProgressPorts> = {}): ToolProgressPorts {
  return {
    session: () => session,
    closed: () => false,
    userSpeaking: () => false,
    assistantSpeaking: () => false,
    now: Date.now,
    ...over,
  };
}

const responder = {
  ready: (): null => null,
  chatForCall: (): string => chatId,
  request: (): string => 'event-1',
  callEnded: (): void => undefined,
};

function endpointOf(id: string): {
  readonly id: string;
  readonly clientId: string;
  readonly send: () => void;
  readonly audio: () => void;
} {
  return { id, clientId: 'client', send: (): void => undefined, audio: (): void => undefined };
}

function deskOf(): CallDesk {
  return new CallDesk({
    store: opened.store,
    provider,
    responder,
    tools: new ToolHub([]),
    prices: { priceOf: () => NO_PRICES },
    cameras: { name: () => 'camera', watch: () => (): void => undefined },
    now: () => new Date('2026-10-10T10:00:00.000Z'),
    log: testLogger('call-desk'),
  });
}

function turnsOf(): TurnSessions {
  const { store } = opened;
  return new TurnSessions({
    store,
    provider,
    responder,
    tools: new ToolHub([]),
    prices: { priceOf: () => NO_PRICES },
    now: () => new Date('2026-10-10T10:00:00.000Z'),
    log: testLogger('turns'),
  });
}

function turnRequest(over: Partial<TurnRequest> = {}): TurnRequest {
  return {
    pluginId: 'plugin',
    caller: { profileId: opened.store.profiles.first().id, role: 'owner', label: 'Robot' },
    chatId,
    place: 'You are a robot.',
    speaking: { hiddenTools: new Set() },
    tools: [],
    opening: null,
    events: {
      audio: (): void => undefined,
      heard: (): void => undefined,
      said: (): void => undefined,
      interrupted: (): void => undefined,
      turnComplete: (): void => undefined,
      ended: (): void => undefined,
    },
    ...over,
  };
}

beforeEach(async () => {
  opened = await testStore();
  systems = [];
  notes = [];
  results = [];
  events = null;
  chatId = opened.store.aiChats.create({
    profileId: opened.store.profiles.first().id,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  }).id;
});

afterEach(async () => {
  vi.useRealTimers();
  await opened.close();
});

const FACTS: PromptFacts = {
  name: 'Coco',
  profileName: 'Sam',
  role: 'owner',
  homeName: 'Home',
  timeZone: 'UTC',
  now: new Date('2026-10-10T10:00:00.000Z'),
  boardTypes: [],
  instructions: '',
  toolIndex: 'get_home: Overview.',
  catalogue: '',
  chat: { id: 'c', title: 'Home', kind: 'chat' },
  interruption: null,
};

function occurrences(text: string): number {
  return text.split(TOOL_MANNER).length - 1;
}

describe('every path that runs tools carries the one shared tool manner', () => {
  it('text chat prompt', () => {
    expect(occurrences(stablePrompt(FACTS))).toBe(1);
    expect(stablePrompt(FACTS).split(FORMAT_MANNER)).toHaveLength(2);
  });

  it('voice instructions with each ending', () => {
    const persona = {
      names: ['Coco'],
      home: 'Home',
      style: undefined,
      instructions: '',
      place: null,
      unavailable: null,
      toolIndex: 'get_home: Overview.',
      catalogue: '',
    };
    for (const ending of [undefined, STAYS_OPEN_ENDING, ROBOT_ENDING]) {
      const text = liveInstructions(ending === undefined ? persona : { ...persona, ending });
      expect(occurrences(text)).toBe(1);
      expect(text).not.toContain(FORMAT_MANNER);
    }
  });

  it('app call, hosted call (camera, ring), and turn sessions (Discord voice, robot)', async () => {
    const { store } = opened;
    store.assistantChat.saveSettings({
      ...store.assistantChat.settings(),
      instructions: 'Call me captain.',
      response_style: {
        ...DEFAULT_RESPONSE_STYLE,
        personality: 'custom',
        custom_personality: 'A pirate.',
      },
    });
    const client = store.clients.create({
      name: 'Pixel',
      platform: 'android',
      role: 'owner',
      tokenHash: 'a'.repeat(64),
    });
    const desk = deskOf();
    await desk.start(endpointOf('app-1'), client, {
      type: 'call_start',
      callId: 'call-app',
      source: 'orb',
      device: 'Phone',
    });
    await desk.start(endpointOf('app-2'), client, {
      type: 'call_start',
      callId: 'call-wake',
      source: 'assistant',
      device: 'Phone',
      gated: true,
    });
    const hosted = await desk.host({
      callId: 'call-hosted',
      endpoint: endpointOf('hosted-1'),
      caller: { profileId: store.profiles.first().id, role: 'owner', label: 'Camera' },
      opening: { chatId, text: 'hello', outreachId: null },
      speaking: { hiddenTools: new Set() },
    });
    const turns = turnsOf();
    const discord = await turns.open(turnRequest());
    const robot = await turns.open(
      turnRequest({ speaking: { hiddenTools: new Set(), ending: ROBOT_ENDING } }),
    );
    expect(systems).toHaveLength(5);
    systems.forEach((system) => {
      expect(occurrences(system)).toBe(1);
      expect(system).not.toContain(FORMAT_MANNER);
      expect(system).toContain('Your personality, which you keep in every reply: A pirate.');
      expect(system).toContain(PLAY);
      expect(system).toContain('Owner instructions:\nCall me captain.');
      expect(system.indexOf(PLAY)).toBeLessThan(system.indexOf(TOOL_MANNER));
    });
    store.assistantChat.saveSettings({
      ...store.assistantChat.settings(),
      response_style: { ...DEFAULT_RESPONSE_STYLE, personality: 'wry' },
    });
    const next = await turns.open(turnRequest());
    expect(systems[5]).toContain('Wry: dry, deadpan humour');
    expect(systems[5]).not.toContain('A pirate.');
    next.end('finished');
    await desk.hangUp('app-1', 'call-app', 'hung_up');
    await desk.hangUp('app-2', 'call-wake', 'hung_up');
    await hosted.end('finished');
    discord.end('finished');
    robot.end('finished');
  });

  it('the bare one-shot turn has no tools and no manner', async () => {
    const turns = turnsOf();
    const bare = await turns.open(turnRequest({ bare: true }));
    expect(systems[0]).toBe('You are a robot.');
    bare.end('finished');
  });
});

describe('trackToolProgress', () => {
  it('speaks a progress note after the threshold and then on every interval', () => {
    vi.useFakeTimers();
    let clock = 0;
    trackToolProgress('subagent_run', ports({ now: () => clock }));
    clock = TOOL_PROGRESS_AFTER_MS - 1;
    vi.advanceTimersByTime(TOOL_PROGRESS_AFTER_MS - 1);
    expect(notes).toEqual([]);
    clock = TOOL_PROGRESS_AFTER_MS;
    vi.advanceTimersByTime(1);
    expect(notes).toEqual([progressNote('subagent_run', 4)]);
    clock = TOOL_PROGRESS_AFTER_MS + TOOL_PROGRESS_EVERY_MS;
    vi.advanceTimersByTime(TOOL_PROGRESS_EVERY_MS);
    expect(notes).toHaveLength(2);
  });

  it('says nothing for a tool that finishes before the threshold', () => {
    vi.useFakeTimers();
    const stop = trackToolProgress('get_home', ports());
    vi.advanceTimersByTime(TOOL_PROGRESS_AFTER_MS - 1);
    stop();
    vi.advanceTimersByTime(TOOL_PROGRESS_EVERY_MS * 3);
    expect(notes).toEqual([]);
  });

  it('stays quiet while the person or the assistant is speaking, and resumes after', () => {
    vi.useFakeTimers();
    let user = true;
    let assistant = false;
    trackToolProgress('x', ports({ userSpeaking: () => user, assistantSpeaking: () => assistant }));
    vi.advanceTimersByTime(TOOL_PROGRESS_AFTER_MS);
    expect(notes).toEqual([]);
    user = false;
    assistant = true;
    vi.advanceTimersByTime(TOOL_PROGRESS_EVERY_MS);
    expect(notes).toEqual([]);
    assistant = false;
    vi.advanceTimersByTime(TOOL_PROGRESS_EVERY_MS);
    expect(notes).toHaveLength(1);
  });

  it('stays quiet once the call has ended or the session is gone', () => {
    vi.useFakeTimers();
    let closed = false;
    trackToolProgress('x', ports({ closed: () => closed }));
    trackToolProgress('y', ports({ session: () => null }));
    closed = true;
    vi.advanceTimersByTime(TOOL_PROGRESS_EVERY_MS * 4);
    expect(notes).toEqual([]);
  });
});

describe('progress while a real tool runs', () => {
  it('a turn session tool: note after the threshold, none after the result, result delivered once', async () => {
    vi.useFakeTimers();
    let finish: () => void = () => undefined;
    const slow = new Promise<{
      response: Record<string, unknown>;
      line: string;
      pictures: never[];
    }>((resolve) => {
      finish = (): void => {
        resolve({ response: { ok: true }, line: '', pictures: [] });
      };
    });
    const turns = turnsOf();
    const open = await turns.open(
      turnRequest({
        bare: true,
        tools: [
          {
            name: 'slow_thing',
            description: 'Slow.',
            parameters: {},
            delivery: 'idle',
            run: (): typeof slow => slow,
          },
        ],
      }),
    );
    events?.tool('t1', 'slow_thing', {});
    await vi.advanceTimersByTimeAsync(TOOL_PROGRESS_AFTER_MS);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('slow_thing');
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual(['slow_thing']);
    await vi.advanceTimersByTimeAsync(TOOL_PROGRESS_EVERY_MS * 3);
    expect(notes).toHaveLength(1);
    open.end('finished');
  });
});

describe('progress during a call tool', () => {
  it('a call conversation tool: note after the threshold, none once the result is in', async () => {
    vi.useFakeTimers();
    let clock = 0;
    let finish: () => void = () => undefined;
    const link: CallLink = {
      audio: () => undefined,
      cut: () => undefined,
      playing: () => false,
      state: () => undefined,
      caption: () => undefined,
    };
    const conversation = new Conversation(
      plainLine(provider),
      link,
      {
        speech: 'gated-client',
        settings: (): AssistantVoiceSettings => ASSISTANT_VOICE_SETTINGS.parse({}),
        system: (): string => 'system',
        note: (): string => '',
        history: (): string[] => [],
        tools: (): [] => [],
        webSearch: (): boolean => false,
        window: (): null => null,
        record: (): void => undefined,
        task: (): string => 'event',
        run: (): Promise<ToolAnswer> =>
          new Promise((resolve) => {
            finish = (): void => {
              resolve({ response: { ok: true }, line: '', pictures: [] });
            };
          }),
        ended: (): void => undefined,
        usage: (): void => undefined,
        measured: (): void => undefined,
        stalled: (): void => undefined,
        staysOpenWhenQuiet: (): boolean => true,
      },
      () => clock,
    );
    await conversation.start(null);
    events?.tool('t1', 'subagent_run', {});
    clock += TOOL_PROGRESS_AFTER_MS;
    await vi.advanceTimersByTimeAsync(TOOL_PROGRESS_AFTER_MS);
    expect(notes).toEqual([progressNote('subagent_run', 4)]);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual(['subagent_run']);
    clock += TOOL_PROGRESS_EVERY_MS * 3;
    await vi.advanceTimersByTimeAsync(TOOL_PROGRESS_EVERY_MS * 3);
    expect(notes).toHaveLength(1);
    await conversation.end('finished');
  });
});
