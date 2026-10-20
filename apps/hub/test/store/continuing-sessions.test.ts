import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testStore, type TestStore } from '../support/store';

const DEVICE = '7a1f4c52-0b8e-4d3a-9c11-2f5e6a7b8c90';
const OTHER_DEVICE = '8b2f5d63-1c9f-4e4b-8d22-3a6f7b8c9da1';

let opened: TestStore;
let profileId: string;

beforeEach(async () => {
  opened = await testStore();
  profileId = opened.store.profiles.list()[0]?.id ?? '';
});

afterEach(async () => {
  await opened.close();
});

function claudeChat(deviceId: string, continuedFrom: string | undefined): string {
  return opened.store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Chat',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: {
      kind: 'claude',
      device_id: deviceId,
      model: 'sonnet',
      effort: null,
      settings: { builtin_tools: [] },
      ...(continuedFrom === undefined ? {} : { continued_from: continuedFrom }),
    },
  }).id;
}

describe('app chats that continue a Desktop Claude session', () => {
  it('lists live and archived chats of the computer, live first, and skips other chats', () => {
    const archived = claudeChat(DEVICE, 'session-a');
    opened.store.aiChats.update(archived, { archived: true });
    const live = claudeChat(DEVICE, 'session-a');
    claudeChat(DEVICE, undefined);
    claudeChat(OTHER_DEVICE, 'session-b');
    expect(opened.store.aiChats.continuingSessions(DEVICE)).toEqual([
      { id: live, session_id: 'session-a' },
      { id: archived, session_id: 'session-a' },
    ]);
  });
});
