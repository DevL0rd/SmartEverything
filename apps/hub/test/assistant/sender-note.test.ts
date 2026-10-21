import { DEFAULT_ENGINE, type AiChatRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stablePrompt, turnPrompt } from '../../src/assistant/conversation/prompt';
import { facts } from '../../src/assistant/prompt-facts';
import { senderNote } from '../../src/assistant/sender-note';
import { toolGuide } from '../../src/ai-tools/tool-guide';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-08T10:00:00.000Z');

let opened: TestStore;
let profileId: string;
let phone: string;
let desktop: string;
let web: string;

function client(name: string, platform: 'android' | 'desktop' | 'web'): string {
  return opened.store.clients.create({
    name,
    platform,
    role: 'owner',
    tokenHash: `${name}-hash`,
  }).id;
}

function chat(): AiChatRow {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  });
}

function placeDesktop(clientId: string, room: string | null): void {
  const roomId = room === null ? null : opened.store.rooms.create(room, 0).id;
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'computer:machine-1',
      parentId: null,
      kind: 'computer',
      name: 'Workstation',
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  opened.store.computerNodes.bind({
    deviceId: row?.id ?? '',
    machineId: 'machine-1',
    tokenHash: 'node-hash',
    hubUrl: 'https://hub.example',
    windowClientId: clientId,
  });
}

beforeEach(async () => {
  opened = await testStore();
  profileId = opened.store.profiles.first().id;
  phone = client('Pixel 9', 'android');
  desktop = client('Studio PC', 'desktop');
  web = client('Browser', 'web');
});

afterEach(async () => {
  await opened.close();
});

describe('the sender line', () => {
  it('names a phone and a web browser by their device name and kind', () => {
    expect(senderNote(opened.store, phone)).toBe('Pixel 9 (phone)');
    expect(senderNote(opened.store, web)).toBe('Browser (web browser)');
  });

  it('names a desktop as a computer and adds its room only when it has one', () => {
    expect(senderNote(opened.store, desktop)).toBe('Studio PC (computer)');
    placeDesktop(desktop, 'Office');
    expect(senderNote(opened.store, desktop)).toBe('Studio PC (computer), Office');
  });

  it('leaves the room out of a placed computer whose device has no room', () => {
    placeDesktop(desktop, null);
    expect(senderNote(opened.store, desktop)).toBe('Studio PC (computer)');
  });

  it('is absent for an unknown or missing sender', () => {
    expect(senderNote(opened.store, null)).toBeNull();
    expect(senderNote(opened.store, '99999999-9999-4999-8999-999999999999')).toBeNull();
  });
});

describe('the per-turn prompt of every engine', () => {
  it('carries the line of the device that sent this turn and follows a device change', () => {
    const row = chat();
    const tools = new ToolHub([]);
    const fromPhone = turnPrompt(facts(opened.store, row, tools, { now: NOW, clientId: phone }));
    const fromDesktop = turnPrompt(
      facts(opened.store, row, tools, { now: NOW, clientId: desktop }),
    );
    expect(fromPhone).toContain('Writing from: Pixel 9 (phone).');
    expect(fromDesktop).toContain('Writing from: Studio PC (computer).');
    expect(fromDesktop).not.toContain('Pixel 9');
  });

  it('omits the line when no device sent the turn', () => {
    const text = turnPrompt(
      facts(opened.store, chat(), new ToolHub([]), { now: NOW, clientId: null }),
    );
    expect(text).not.toContain('Writing from');
  });

  it('stays the same for the same device so the cached prefix is not disturbed', () => {
    const row = chat();
    const tools = new ToolHub([]);
    const later = new Date('2026-10-08T10:00:42.000Z');
    const line = (now: Date): string | undefined =>
      turnPrompt(facts(opened.store, row, tools, { now, clientId: desktop }))
        .split('\n')
        .find((entry) => entry.startsWith('Writing from'));
    expect(line(NOW)).toBe(line(later));
  });
});

describe('the guidance for the sender line', () => {
  it('tells the AI in the stable prompt to use it for here and this room', () => {
    const stable = stablePrompt(
      facts(opened.store, chat(), new ToolHub([]), { now: NOW, clientId: phone }),
    );
    expect(stable).toContain('Writing from');
    expect(stable).toContain('this room');
    expect(stable).toContain('device_find');
  });

  it('keeps it out of the shared tool guide so a voice call does not pay for it', () => {
    expect(toolGuide(['device_find'])).not.toContain('Writing from');
  });
});
