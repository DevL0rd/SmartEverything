import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { latestPersonMessage, voiceMemory } from '../../src/assistant-voice/voice-memory';
import type { MemoryPrincipal } from '../../src/memory/principal';
import { MemoryService } from '../../src/memory/service';
import type { NewAssistantMessage } from '../../src/store/repositories/assistant-chat';
import { TEST_ENGINE } from '../support/engine';
import { captureLogs } from '../support/logs';
import { FakeMemoryEmbedder } from '../support/memory-embedder';
import { remember } from '../support/memory-service';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let embedder: RecordingEmbedder;
let service: MemoryService;
let ida: MemoryPrincipal;
let chatId: string;
let events: () => string[];

function chatOf(profileId: string): string {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
    titleAuto: false,
  }).id;
}

function personMessage(profileId: string, chat: string, text: string): NewAssistantMessage {
  return {
    profile_id: profileId,
    client_id: null,
    chat_id: chat,
    role: 'person',
    kind: 'text',
    author: 'Ida',
    text,
    attachments: [],
    state: null,
    reason: null,
    steps: [],
    step_states: [],
    reply_to: null,
    quote: null,
    origin: null,
    embeds: [],
    cost_micros: 0,
    model: null,
  };
}

function relevantTexts(): string[] {
  return service.recall(ida).relevant.map((memory) => memory.text);
}

class RecordingEmbedder extends FakeMemoryEmbedder {
  readonly inputs: string[] = [];

  override embed(texts: readonly string[]): Promise<Float32Array[]> {
    this.inputs.push(...texts);
    return super.embed(texts);
  }
}

beforeEach(async () => {
  events = captureLogs().events;
  opened = await testStore();
  embedder = new RecordingEmbedder();
  service = new MemoryService(opened.store.aiMemories, opened.store.aiChats, embedder, {
    judge: null,
    zone: (): string => 'UTC',
    now: (): Date => new Date('2026-10-08T10:00:00.000Z'),
  });
  const member = opened.store.profiles.create({ name: 'Ida' }).id;
  chatId = chatOf(member);
  ida = { profileId: member, role: 'member', chatId, messageId: null };
});

afterEach(async () => {
  await opened.close();
});

describe('preparing a message with no wording', () => {
  it('embeds nothing, logs no exception and recalls no relevance for an empty message', async () => {
    await remember(service, ida, { scope: 'person', text: 'Rex is the dog' });
    const calls = embedder.calls;

    await service.prepare(ida, { id: 'm1', text: '' });

    expect(embedder.calls).toBe(calls);
    expect(events()).not.toContain('memory.relevance_failed');
    expect(relevantTexts()).toStrictEqual([]);
  });

  it('treats a whitespace-only message the same way', async () => {
    await remember(service, ida, { scope: 'person', text: 'Rex is the dog' });
    const calls = embedder.calls;

    await service.prepare(ida, { id: 'm1', text: ' \n\t ' });

    expect(embedder.calls).toBe(calls);
    expect(events()).not.toContain('memory.relevance_failed');
    expect(relevantTexts()).toStrictEqual([]);
  });

  it('drops the relevance of the earlier message when the next message has no wording', async () => {
    await remember(service, ida, { scope: 'person', text: 'Rex is the dog' });
    await service.prepare(ida, { id: 'm1', text: 'dog' });
    expect(relevantTexts()).toStrictEqual(['Rex is the dog']);
    const calls = embedder.calls;

    await service.prepare(ida, { id: 'm2', text: '' });

    expect(embedder.calls).toBe(calls);
    expect(relevantTexts()).toStrictEqual([]);
  });

  it('drops an empty message from the voice entry point too', async () => {
    await remember(service, ida, { scope: 'person', text: 'Rex is the dog' });
    opened.store.assistantChat.addMessage(personMessage(ida.profileId, chatId, ''));
    const voice = voiceMemory(service, (chat) => latestPersonMessage(opened.store, chat));
    const calls = embedder.calls;

    await voice.prepare(ida);

    expect(embedder.calls).toBe(calls);
    expect(events()).not.toContain('memory.relevance_failed');
    expect(relevantTexts()).toStrictEqual([]);
  });
});

describe('preparing a message with surrounding whitespace', () => {
  it('embeds the trimmed wording and ranks memory against it', async () => {
    await remember(service, ida, { scope: 'person', text: 'Rex is the dog' });
    const before = embedder.inputs.length;

    await service.prepare(ida, { id: 'm1', text: '  dog  ' });

    expect(embedder.inputs.slice(before)).toStrictEqual(['dog']);
    expect(relevantTexts()).toStrictEqual(['Rex is the dog']);
  });
});
