import { DEFAULT_ENGINE } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { machineLabel, ownScreenOf, ownScreenRule } from '../../src/assistant/machine';
import { conversationNote } from '../../src/assistant-voice/instructions';
import { callerOf, hostedCallerOf, noteOf } from '../../src/assistant-voice/persona';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-18T01:36:00.000Z');

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

function noteText(caller: ReturnType<typeof callerOf>): string {
  const chat = opened.store.aiChats.create({
    profileId: caller.profileId,
    kind: 'chat',
    title: 'Call',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  });
  return conversationNote(
    noteOf({
      store: opened.store,
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

function clientOf(
  name: string,
  platform: 'android' | 'desktop' | 'web',
  kind?: 'tablet',
): ReturnType<typeof callerOf> {
  const client = opened.store.clients.create({
    name,
    platform,
    kind,
    role: 'owner',
    tokenHash: `${name}-hash`,
  });
  return callerOf(opened.store, client, `${name} label`);
}

describe('which machine a call comes from', () => {
  it('tells a phone call that my screen is the phone screen', () => {
    const text = noteText(clientOf('Pixel 9', 'android'));
    expect(text).toContain('talking through Pixel 9 (phone).');
    expect(text).toContain('they mean the screen of Pixel 9: look at phone_screen');
    expect(text).toContain('only when they name that device');
  });

  it('tells a tablet call that it is a tablet and that my screen is its screen', () => {
    const text = noteText(clientOf('Tab S9', 'android', 'tablet'));
    expect(text).toContain('talking through Tab S9 (tablet).');
    expect(text).toContain('they mean the screen of Tab S9: look at phone_screen');
  });

  it('tells a computer call that my screen is the computer screen', () => {
    const text = noteText(clientOf('Studio PC', 'desktop'));
    expect(text).toContain('talking through Studio PC (computer).');
    expect(text).toContain('look at desktop_screen');
  });

  it('tells a web browser call that my screen is the browser machine screen', () => {
    const text = noteText(clientOf('Browser', 'web'));
    expect(text).toContain('talking through Browser (web browser).');
    expect(text).toContain('look at desktop_screen');
  });

  it('tells a hosted wake call on a computer that the caller is that computer', () => {
    const profile = opened.store.profiles.first();
    const caller = hostedCallerOf(opened.store, {
      profileId: profile.id,
      role: 'owner',
      label: 'Office PC',
      machine: { name: 'Office PC', kind: 'computer', room: null },
    });
    const text = noteText(caller);
    expect(text).toContain('talking through Office PC (computer).');
    expect(text).toContain('look at desktop_screen');
  });

  it('names a camera call without a screen rule', () => {
    const machine = { name: 'Hall camera', kind: 'camera', room: null } as const;
    expect(machineLabel(machine)).toBe('Hall camera (camera)');
    expect(ownScreenOf(machine)).toBeNull();
    expect(ownScreenRule(machine)).toBeNull();
  });

  it('leaves a call with no machine as it was', () => {
    const profile = opened.store.profiles.first();
    const text = noteText(
      hostedCallerOf(opened.store, { profileId: profile.id, role: 'owner', label: 'Discord' }),
    );
    expect(text).toContain('talking through Discord.');
    expect(text).not.toContain('my screen');
  });
});
