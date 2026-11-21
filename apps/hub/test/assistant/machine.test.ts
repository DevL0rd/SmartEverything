import { callPrincipal } from '../../src/assistant-voice/voice-memory';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { machineLabel, ownScreenOf, ownScreenRule } from '../../src/assistant/machine';
import { conversationNote } from '../../src/assistant-voice/instructions';
import { callerOf, hostedCallerOf, noteOf } from '../../src/assistant-voice/persona';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { testStore, type TestStore } from '../support/store';
import { testVoiceMemory } from '../support/voice-memory';
import { TEST_ENGINE } from '../support/engine';

const NOW = new Date('2026-10-18T01:36:00.000Z');

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
  await opened.store.live.home.load();
});

afterEach(async () => {
  await opened.close();
});

async function noteText(caller: Awaited<ReturnType<typeof callerOf>>): Promise<string> {
  const chat = opened.store.aiChats.create({
    profileId: caller.profileId,
    kind: 'chat',
    title: 'Call',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: TEST_ENGINE,
  });
  const memory = testVoiceMemory(opened.store);
  await memory.prepare(callPrincipal({ ...caller, chatId: chat.id }));
  return conversationNote(
    await noteOf({
      store: opened.store,
      tools: new ToolHub([]),
      memory,
      caller,
      chatId: chat.id,
      place: null,
      recentSpeech: null,
      known: null,
      starting: false,
      now: NOW,
    }),
  );
}

async function clientOf(
  name: string,
  platform: 'android' | 'desktop' | 'web',
  kind?: 'tablet',
): Promise<Awaited<ReturnType<typeof callerOf>>> {
  const client = opened.store.clients.create({
    name,
    platform,
    kind,
    role: 'owner',
    tokenHash: `${name}-hash`,
  });
  return await callerOf(opened.store, client, `${name} label`);
}

describe('which machine a call comes from', () => {
  it('tells a phone call that my screen is the phone screen', async () => {
    const text = await noteText(await clientOf('Pixel 9', 'android'));
    expect(text).toContain('From: Pixel 9 (phone).');
    expect(text).toContain('they mean the screen of Pixel 9: look at phone_screen');
    expect(text).toContain('only when they name that device');
  });

  it('tells a tablet call that it is a tablet and that my screen is its screen', async () => {
    const text = await noteText(await clientOf('Tab S9', 'android', 'tablet'));
    expect(text).toContain('From: Tab S9 (tablet).');
    expect(text).toContain('they mean the screen of Tab S9: look at phone_screen');
  });

  it('tells a computer call that my screen is the computer screen', async () => {
    const text = await noteText(await clientOf('Studio PC', 'desktop'));
    expect(text).toContain('From: Studio PC (computer).');
    expect(text).toContain('look at desktop_screen');
  });

  it('tells a web browser call that my screen is the browser machine screen', async () => {
    const text = await noteText(await clientOf('Browser', 'web'));
    expect(text).toContain('From: Browser (web browser).');
    expect(text).toContain('look at desktop_screen');
  });

  it('tells a hosted wake call on a computer that the caller is that computer', async () => {
    const profile = opened.store.profiles.first();
    const caller = await hostedCallerOf(opened.store, {
      profileId: profile.id,
      role: 'owner',
      label: 'Office PC',
      machine: { name: 'Office PC', kind: 'computer', room: null },
    });
    const text = await noteText(caller);
    expect(text).toContain('From: Office PC (computer).');
    expect(text).toContain('look at desktop_screen');
  });

  it('names a camera call without a screen rule', () => {
    const machine = { name: 'Hall camera', kind: 'camera', room: null } as const;
    expect(machineLabel(machine)).toBe('Hall camera (camera)');
    expect(ownScreenOf(machine)).toBeNull();
    expect(ownScreenRule(machine)).toBeNull();
  });

  it('leaves a call with no machine as it was', async () => {
    const profile = opened.store.profiles.first();
    const text = await noteText(
      await hostedCallerOf(opened.store, {
        profileId: profile.id,
        role: 'owner',
        label: 'Discord',
      }),
    );
    expect(text).toContain('From: Discord.');
    expect(text).not.toContain('my screen');
  });
});
