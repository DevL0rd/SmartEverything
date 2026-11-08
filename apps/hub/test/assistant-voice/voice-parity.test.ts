import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RESPONSE_STYLE } from '@smarteverything/domain';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { FORMAT_MANNER, WIDGET_MANNER } from '../../src/ai-tools/tool-guide';
import {
  contextLines,
  homeRules,
  identityLine,
  stablePrompt,
  toolSections,
  turnPrompt,
  type PromptFacts,
  type StableFacts,
} from '../../src/assistant/conversation/prompt';
import { personalitySection } from '../../src/assistant/personality';
import { conversationNote, liveInstructions } from '../../src/assistant-voice/instructions';
import { hostedCallerOf } from '../../src/assistant-voice/persona';
import {
  declarationsOf,
  voiceHub,
  voiceNoteOf,
  type VoiceKit,
  type VoiceWho,
} from '../../src/assistant-voice/voice-kit';
import { TEST_ENGINE } from '../support/engine';
import { testStore, type TestStore } from '../support/store';
import { testVoiceMemory } from '../support/voice-memory';

const FACTS: StableFacts = {
  name: 'Coordinator',
  aliases: ['Coco'],
  homeName: 'Home',
  instructions: 'Call me captain.',
  responseStyle: { ...DEFAULT_RESPONSE_STYLE, verbosity: 'brief', format: 'lists' },
  guide: 'Ids and keys come from reads.',
  toolIndex: 'weather_read (weather)',
  catalogue: 'fan_boost: Boosts the fan.',
};

const CONTEXT: PromptFacts = {
  ...FACTS,
  profileName: 'Sam',
  role: 'member',
  timeZone: 'Europe/Berlin',
  now: new Date('2026-10-10T08:00:00.000Z'),
  boardTypes: [],
  interruption: null,
  sender: 'Pixel 9 (phone)',
  chat: { id: 'chat-1', title: 'Kitchen', kind: 'chat' },
};

const VOICE = liveInstructions({ facts: FACTS, place: null, unavailable: null, sight: true });
const CHAT = stablePrompt(FACTS);

describe('chat and voice build their context from the same pieces', () => {
  it('share identity, personality, owner instructions, rules and the tool sections', () => {
    const shared = [
      identityLine(FACTS),
      personalitySection(FACTS.responseStyle, FACTS.instructions),
      ...homeRules([]).split('\n').slice(1),
      ...toolSections(FACTS),
      'Keep explanations brief',
    ];
    for (const piece of shared) {
      expect(CHAT).toContain(piece);
      expect(VOICE).toContain(piece);
    }
    expect(VOICE).toContain('(also called Coco)');
  });

  it('share every per-turn context line: person and role, chat, device, local time', () => {
    const note = conversationNote({
      context: CONTEXT,
      screenRule: null,
      place: null,
      recentSpeech: null,
      memories: '',
      history: [],
      since: 'start',
      starting: false,
    });
    const turn = turnPrompt(CONTEXT);
    for (const line of contextLines(CONTEXT)) {
      expect(turn).toContain(line);
      expect(note).toContain(line);
    }
    expect(note).toContain('You can reach only this person');
  });

  it('keep voice-only text out of chat and chat-only text out of voice', () => {
    for (const voiceOnly of [
      'live voice call',
      'speech-to-text',
      'conversation_end',
      'sight_stop',
    ]) {
      expect(CHAT).not.toContain(voiceOnly);
      expect(VOICE).toContain(voiceOnly);
    }
    for (const chatOnly of [
      FORMAT_MANNER,
      WIDGET_MANNER,
      'User message received while you were working',
    ]) {
      expect(VOICE).not.toContain(chatOnly);
      expect(CHAT).toContain(chatOnly);
    }
    expect(CHAT).toContain('Prefer lists');
    expect(VOICE).not.toContain('Prefer lists');
  });
});

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function kitOf(): VoiceKit {
  return {
    store: opened.store,
    memory: testVoiceMemory(opened.store),
    responder: {
      ready: () => null,
      chatForCall: () => '',
      request: () => '',
      callEnded: () => undefined,
    },
    tools: new ToolHub([]),
    now: () => new Date('2026-10-10T10:00:00.000Z'),
  };
}

function whoOf(): VoiceWho {
  const profileId = opened.store.profiles.first().id;
  const chat = opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Kitchen',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  });
  return {
    caller: hostedCallerOf(opened.store, { profileId, role: 'owner', label: 'Kitchen speaker' }),
    chatId: chat.id,
    place: null,
    speaking: null,
    canSee: false,
  };
}

const REQUEST = { recentSpeech: null, known: null, starting: true } as const;

describe('memory in a voice call', () => {
  it('declares the memory tool, keeps what it adds and recalls it into the conversation note', async () => {
    const kit = kitOf();
    const who = whoOf();
    const hub = voiceHub(kit, () => who);
    expect(declarationsOf(kit, hub, who).map((tool) => tool.name)).toContain('memory');
    const added = await hub.call(
      'memory',
      { action: 'add', scope: 'person', text: 'Sam takes the 8:10 bus.' },
      {
        profileId: who.caller.profileId,
        role: 'owner',
        chatId: who.chatId,
        via: 'voice',
        clientId: null,
      },
    );
    expect(added.response['error']).toBeUndefined();
    const note = voiceNoteOf(kit, hub, who, REQUEST);
    expect(note).toContain('Notes kept with the memory tool');
    expect(note).toContain('Sam takes the 8:10 bus.');
    expect(note).toContain('Person: Me, the owner of the home.');
    expect(liveInstructions({ facts: FACTS, place: null, unavailable: null })).not.toContain(
      'Sam takes',
    );
  });

  it('offers no memory when the person switched it off or the chat has memory off', async () => {
    const kit = kitOf();
    const who = whoOf();
    const hub = voiceHub(kit, () => who);
    await hub.call(
      'memory',
      { action: 'add', scope: 'person', text: 'Likes green tea.' },
      {
        profileId: who.caller.profileId,
        role: 'owner',
        chatId: who.chatId,
        via: 'voice',
        clientId: null,
      },
    );
    opened.store.aiChats.update(who.chatId, { memory: false });
    expect(hub.list().map((tool) => tool.name)).not.toContain('memory');
    expect(voiceNoteOf(kit, hub, who, REQUEST)).not.toContain('green tea');
    opened.store.aiChats.update(who.chatId, { memory: true });
    expect(voiceNoteOf(kit, hub, who, REQUEST)).toContain('green tea');
    opened.store.aiMemories.changeSettings(who.caller.profileId, { enabled: false });
    expect(hub.list().map((tool) => tool.name)).not.toContain('memory');
    expect(voiceNoteOf(kit, hub, who, REQUEST)).not.toContain('green tea');
  });
});
