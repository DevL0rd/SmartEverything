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

async function makeListener(
  kind: DeviceKind,
  name: string,
  profileId: string,
  transcribe: boolean,
): Promise<string> {
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
  await new DeviceListeningSwitches(opened.store).save(device.id, { transcribe });
  return device.id;
}

async function sayOn(source: 'phone' | 'computer', sourceId: string, text: string): Promise<void> {
  const { id } = await transcripts.open({
    source,
    sourceId,
    pluginId: null,
    title: source,
    retentionDays: null,
    startedAt: new Date(Date.parse(NOW) - 3_600_000).toISOString(),
  });
  await transcripts.add(id, {
    at: new Date(Date.parse(NOW) - 60_000).toISOString(),
    speaker_id: null,
    speaker: 'Pat',
    text,
    bot: false,
  });
}

async function say(
  secondsAgo: number,
  text: string,
  extra: Partial<TranscriptLineInput> = {},
): Promise<void> {
  await transcripts.add(sessionId, {
    at: new Date(Date.parse(NOW) - secondsAgo * 1000).toISOString(),
    speaker_id: null,
    speaker: 'Kitchen',
    text,
    bot: false,
    ...extra,
  });
}

async function recall(
  role: 'owner' | 'member' = 'owner',
  id: string = cameraId,
  profileId = 'someone',
): Promise<string | null> {
  return await recentSpeechOf(
    { store: opened.store, now: () => new Date(NOW), log: testLogger('voice') },
    { callId: 'call-1', deviceId: id, role, profileId },
  );
}

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
  await opened.store.live.home.load();
  transcripts = new Transcripts({
    store: opened.store,
    clock: new FakeClock(NOW),
    log: testLogger('transcripts'),
  });
  cameraId = makeCamera('Kitchen', true);
  ({ id: sessionId } = await transcripts.open({
    source: 'camera',
    sourceId: cameraId,
    pluginId: null,
    title: 'Kitchen',
    retentionDays: null,
    startedAt: new Date(Date.parse(NOW) - 3_600_000).toISOString(),
  }));
});

afterEach(async () => {
  await opened.close();
});

describe('recentSpeechOf', () => {
  it('lists the last five minutes oldest first with relative times and drops older speech', async () => {
    await say(400, 'too old');
    await say(240, 'dinner is ready');
    await say(30, 'I will set the table');
    const text = (await recall()) ?? '';
    expect(text).toContain('Recent speech heard on Kitchen (last 5 minutes)');
    expect(text).not.toContain('too old');
    expect(text.indexOf('[4 min ago] dinner is ready')).toBeGreaterThan(0);
    expect(text.indexOf('[just now] I will set the table')).toBeGreaterThan(
      text.indexOf('dinner is ready'),
    );
  });

  it('keeps the newest speech within the character budget', async () => {
    for (let index = 0; index < 100; index += 1) {
      await say(280 - index, `line ${String(index).padStart(3, '0')} ${'x'.repeat(60)}`);
    }
    const text = (await recall()) ?? '';
    expect(text.length).toBeLessThan(4400);
    expect(text).toContain('line 099');
    expect(text).not.toContain('line 000');
  });

  it('names a speaker who differs from the camera and leaves out the AI and the wake phrase', async () => {
    await say(120, 'Sam says hello', { speaker: 'Sam' });
    await say(100, 'the assistant answered', { bot: true });
    await say(5, 'hey Coordinator turn on the lamp');
    const text = (await recall()) ?? '';
    expect(text).toContain('Sam: Sam says hello');
    expect(text).not.toContain('answered');
    expect(text).not.toContain('turn on the lamp');
  });

  it('gives a member nothing, and nothing when transcription is off, the window is 0 or nothing was heard', async () => {
    await say(60, 'private talk');
    expect(await recall('member')).toBeNull();
    const quiet = makeCamera('Porch', false);
    expect(await recall('owner', quiet)).toBeNull();
    const { assistant } = opened.store.live.home;
    const settings = assistant.read();
    await assistant.save({
      ...settings,
      voice: { ...settings.voice, speech_context_minutes: 0 },
    });
    expect(await recall()).toBeNull();
    await assistant.save({
      ...settings,
      voice: { ...settings.voice, speech_context_minutes: 1 },
    });
    expect(await recall()).toContain('private talk');
  });

  it('reads only the called camera and logs counts without the text', async () => {
    const other = makeCamera('Garage', true);
    const { id: garage } = await transcripts.open({
      source: 'camera',
      sourceId: other,
      pluginId: null,
      title: 'Garage',
      retentionDays: null,
      startedAt: new Date(Date.parse(NOW) - 3_600_000).toISOString(),
    });
    await transcripts.add(garage, {
      at: new Date(Date.parse(NOW) - 10_000).toISOString(),
      speaker_id: null,
      speaker: 'Garage',
      text: 'engine noise',
      bot: false,
    });
    await say(60, 'cooking');
    const text = (await recall()) ?? '';
    expect(text).toContain('cooking');
    expect(text).not.toContain('engine');
    const record = logs.records.find((entry) => entry.event === 'voice.recent_speech');
    expect(record?.payload).toMatchObject({ callId: 'call-1', deviceId: cameraId, lines: 1 });
    expect(JSON.stringify(record)).not.toContain('cooking');
  });

  it('gives the winning phone or computer its own last five minutes', async () => {
    const phone = await makeListener('phone', 'Pat phone', 'pat', true);
    const computer = await makeListener('computer', 'Pat desk', 'pat', true);
    await sayOn('phone', phone, 'call me back');
    await sayOn('computer', computer, 'compile finished');
    await say(30, 'kitchen noise');
    const heardOnPhone = (await recall('owner', phone)) ?? '';
    expect(heardOnPhone).toContain('Recent speech heard on Pat phone');
    expect(heardOnPhone).toContain('call me back');
    expect(heardOnPhone).not.toContain('compile');
    expect(heardOnPhone).not.toContain('kitchen');
    expect(await recall('owner', computer)).toContain('compile finished');
  });

  it('keeps a phone or computer private unless transcribing, and gives a member only their own', async () => {
    const own = await makeListener('phone', 'Pat phone', 'pat', true);
    const off = await makeListener('computer', 'Pat desk', 'pat', false);
    await sayOn('phone', own, 'my errands');
    await sayOn('computer', off, 'not written down');
    expect(await recall('owner', off)).toBeNull();
    expect(await recall('member', own, 'pat')).toContain('my errands');
    expect(await recall('member', own, 'sam')).toBeNull();
    await say(30, 'camera talk');
    expect(await recall('member', cameraId, 'pat')).toBeNull();
  });
});
