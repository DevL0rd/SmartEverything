import type { TranscriptLineInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DeviceKind } from '@smarteverything/domain';
import { DeviceListeningSwitches } from '../../src/listening/listening-switches';
import { recentSpeechOf } from '../../src/assistant-voice/recent-speech';
import { Transcripts } from '../../src/transcripts/transcript-service';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-10-08T10:10:00.000Z';

let opened: TestStore;
let logs: CapturedLogs;
let transcripts: Transcripts;
let cameraId: string;
let sessionId: string;

function makeCamera(name: string, transcribe: boolean): string {
  const [device] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: name,
      parentId: null,
      kind: 'camera',
      name,
      model: 'chuangmi.camera.v1',
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (device === undefined) {
    throw new Error('the device was not stored');
  }
  opened.store.cameras.upsert([
    {
      deviceId: device.id,
      streamName: device.id,
      sourceUrlKind: 'xiaomi',
      physicalPtz: false,
      twoWayAudio: false,
    },
  ]);
  opened.store.cameras.change(device.id, { transcribe });
  return device.id;
}

function makeListener(
  kind: DeviceKind,
  name: string,
  profileId: string,
  transcribe: boolean,
): string {
  const [device] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: name,
      parentId: null,
      kind,
      name,
      model: kind,
      manufacturer: 'Local',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: { profileId },
    },
  ]);
  if (device === undefined) {
    throw new Error('the device was not stored');
  }
  new DeviceListeningSwitches(opened.store).save(device.id, { transcribe });
  return device.id;
}

function sayOn(source: 'phone' | 'computer', sourceId: string, text: string): void {
  const id = transcripts.open({
    source,
    sourceId,
    pluginId: null,
    title: source,
    retentionDays: null,
    startedAt: new Date(Date.parse(NOW) - 3_600_000).toISOString(),
  }).id;
  transcripts.add(id, {
    at: new Date(Date.parse(NOW) - 60_000).toISOString(),
    speaker_id: null,
    speaker: 'Pat',
    text,
    bot: false,
  });
}

function say(secondsAgo: number, text: string, extra: Partial<TranscriptLineInput> = {}): void {
  transcripts.add(sessionId, {
    at: new Date(Date.parse(NOW) - secondsAgo * 1000).toISOString(),
    speaker_id: null,
    speaker: 'Kitchen',
    text,
    bot: false,
    ...extra,
  });
}

function recall(
  role: 'owner' | 'member' = 'owner',
  id: string = cameraId,
  profileId = 'someone',
): string | null {
  return recentSpeechOf(
    { store: opened.store, now: () => new Date(NOW), log: testLogger('voice') },
    { callId: 'call-1', deviceId: id, role, profileId },
  );
}

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
  transcripts = new Transcripts({
    store: opened.store,
    clock: new FakeClock(NOW),
    log: testLogger('transcripts'),
  });
  cameraId = makeCamera('Kitchen', true);
  sessionId = transcripts.open({
    source: 'camera',
    sourceId: cameraId,
    pluginId: null,
    title: 'Kitchen',
    retentionDays: null,
    startedAt: new Date(Date.parse(NOW) - 3_600_000).toISOString(),
  }).id;
});

afterEach(async () => {
  await opened.close();
});

describe('recentSpeechOf', () => {
  it('lists the last five minutes oldest first with relative times and drops older speech', () => {
    say(400, 'too old');
    say(240, 'dinner is ready');
    say(30, 'I will set the table');
    const text = recall() ?? '';
    expect(text).toContain('Recent speech heard on Kitchen (last 5 minutes)');
    expect(text).not.toContain('too old');
    expect(text.indexOf('[4 min ago] dinner is ready')).toBeGreaterThan(0);
    expect(text.indexOf('[just now] I will set the table')).toBeGreaterThan(
      text.indexOf('dinner is ready'),
    );
  });

  it('keeps the newest speech within the character budget', () => {
    for (let index = 0; index < 100; index += 1) {
      say(280 - index, `line ${String(index).padStart(3, '0')} ${'x'.repeat(60)}`);
    }
    const text = recall() ?? '';
    expect(text.length).toBeLessThan(4400);
    expect(text).toContain('line 099');
    expect(text).not.toContain('line 000');
  });

  it('names a speaker who differs from the camera and leaves out the AI and the wake phrase', () => {
    say(120, 'Sam says hello', { speaker: 'Sam' });
    say(100, 'the assistant answered', { bot: true });
    say(5, 'hey Coordinator turn on the lamp');
    const text = recall() ?? '';
    expect(text).toContain('Sam: Sam says hello');
    expect(text).not.toContain('answered');
    expect(text).not.toContain('turn on the lamp');
  });

  it('gives a member nothing, and nothing when transcription is off, the window is 0 or nothing was heard', () => {
    say(60, 'private talk');
    expect(recall('member')).toBeNull();
    const quiet = makeCamera('Porch', false);
    expect(recall('owner', quiet)).toBeNull();
    const settings = opened.store.assistantChat.settings();
    opened.store.assistantChat.saveSettings({
      ...settings,
      voice: { ...settings.voice, speech_context_minutes: 0 },
    });
    expect(recall()).toBeNull();
    opened.store.assistantChat.saveSettings({
      ...settings,
      voice: { ...settings.voice, speech_context_minutes: 1 },
    });
    expect(recall()).toContain('private talk');
  });

  it('reads only the called camera and logs counts without the text', () => {
    const other = makeCamera('Garage', true);
    const garage = transcripts.open({
      source: 'camera',
      sourceId: other,
      pluginId: null,
      title: 'Garage',
      retentionDays: null,
      startedAt: new Date(Date.parse(NOW) - 3_600_000).toISOString(),
    }).id;
    transcripts.add(garage, {
      at: new Date(Date.parse(NOW) - 10_000).toISOString(),
      speaker_id: null,
      speaker: 'Garage',
      text: 'engine noise',
      bot: false,
    });
    say(60, 'cooking');
    const text = recall() ?? '';
    expect(text).toContain('cooking');
    expect(text).not.toContain('engine');
    const record = logs.records.find((entry) => entry.event === 'voice.recent_speech');
    expect(record?.payload).toMatchObject({ callId: 'call-1', deviceId: cameraId, lines: 1 });
    expect(JSON.stringify(record)).not.toContain('cooking');
  });

  it('gives the winning phone or computer its own last five minutes', () => {
    const phone = makeListener('phone', 'Pat phone', 'pat', true);
    const computer = makeListener('computer', 'Pat desk', 'pat', true);
    sayOn('phone', phone, 'call me back');
    sayOn('computer', computer, 'compile finished');
    say(30, 'kitchen noise');
    const heardOnPhone = recall('owner', phone) ?? '';
    expect(heardOnPhone).toContain('Recent speech heard on Pat phone');
    expect(heardOnPhone).toContain('call me back');
    expect(heardOnPhone).not.toContain('compile');
    expect(heardOnPhone).not.toContain('kitchen');
    expect(recall('owner', computer)).toContain('compile finished');
  });

  it('keeps a phone or computer private unless transcribing, and gives a member only their own', () => {
    const own = makeListener('phone', 'Pat phone', 'pat', true);
    const off = makeListener('computer', 'Pat desk', 'pat', false);
    sayOn('phone', own, 'my errands');
    sayOn('computer', off, 'not written down');
    expect(recall('owner', off)).toBeNull();
    expect(recall('member', own, 'pat')).toContain('my errands');
    expect(recall('member', own, 'sam')).toBeNull();
    say(30, 'camera talk');
    expect(recall('member', cameraId, 'pat')).toBeNull();
  });
});
