import { DEFAULT_ENGINE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubTool } from '../../src/ai-tools/hub-tool';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import {
  callSearchesWeb,
  voiceHub,
  type VoiceKit,
  type VoiceWho,
} from '../../src/assistant-voice/voice-kit';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function toolOf(name: string): HubTool {
  return {
    name,
    title: name,
    description: name,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
    origin: { kind: 'core' },
    humanOnly: false,
  };
}

function kitOf(tools: readonly string[]): VoiceKit {
  return {
    store: opened.store,
    responder: {
      ready: () => null,
      chatForCall: () => '',
      request: () => '',
      callEnded: () => undefined,
    },
    tools: new ToolHub([
      {
        tools: () => tools.map(toolOf),
        call: () => Promise.reject(new Error('unused')),
        validate: () => null,
        changes: () => () => undefined,
      },
    ]),
    now: () => new Date('2026-10-10T10:00:00.000Z'),
  };
}

function whoOf(granted: readonly string[] | null): VoiceWho {
  const chat = opened.store.aiChats.create({
    profileId: opened.store.profiles.first().id,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
    tools: granted,
  });
  return {
    caller: {
      clientId: null,
      profileId: chat.profile_id,
      role: 'owner',
      person: 'Owner',
      device: 'Hub',
      machine: null,
    },
    chatId: chat.id,
    place: null,
    speaking: null,
    canSee: false,
  };
}

describe('call web search follows the chat tool grants', () => {
  it('searches the web when the chat may use every tool', () => {
    const who = whoOf(null);
    expect(callSearchesWeb(voiceHub(kitOf(['web_search', 'light_on']), () => who))).toBe(true);
  });

  it('searches the web when the chat grants web search', () => {
    const who = whoOf(['web_search']);
    expect(callSearchesWeb(voiceHub(kitOf(['web_search', 'light_on']), () => who))).toBe(true);
  });

  it('does not search the web when the chat withholds it', () => {
    const who = whoOf(['light_on']);
    expect(callSearchesWeb(voiceHub(kitOf(['web_search', 'light_on']), () => who))).toBe(false);
  });
});
