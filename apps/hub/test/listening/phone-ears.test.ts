import { ApiError, DEFAULT_PAUSE_MS, type ListeningEarNotice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EndOfSpeechPause } from '../../src/listening/end-of-speech-pause';
import { ListeningRegistry } from '../../src/listening/listening-registry';
import { PhoneEars } from '../../src/listening/phone-ears';
import { DeviceListeningSwitches } from '../../src/listening/listening-switches';
import { phoneExternalId } from '../../src/phones/phone-device';
import { ReachRules } from '../../src/reach/reach-rules';
import type { SpeechSegment } from '../../src/listening/speech-segment';
import { dbfsOfPcm } from '../../src/transcripts/line-levels';
import type { EarKeywords } from '../../src/wake-name/keyword-lines';
import { WakeClaims } from '../../src/wake-name/wake-claims';
import { FakeClock } from '../support/fake-clock';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { idleWakeTest } from '../wake-test-idle';

const START = '2026-10-18T10:00:00.000Z';
const CLIENT = crypto.randomUUID();
const SAMPLES_PER_SECOND = 16_000;

let opened: TestStore;
let clock: FakeClock;
let claims: WakeClaims;
let registry: ListeningRegistry;
let ears: PhoneEars;
let pause: EndOfSpeechPause;
let phone: string;
let online: Set<string>;
let sent: { clientId: string; notice: ListeningEarNotice }[];
let heard: { deviceId: string; segment: SpeechSegment }[];
let names: string[];
let testing: boolean;
let levels: { sourceKey: string; dbfs: number }[];

function device(clientId: string, name: string): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: phoneExternalId(clientId),
      parentId: null,
      kind: 'phone',
      name,
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: { clientId, profileId: opened.store.profiles.first().id },
    },
  ]);
  return row?.id ?? '';
}

function tone(seconds: number, amplitude: number): Int16Array {
  return new Int16Array(seconds * SAMPLES_PER_SECOND).fill(amplitude);
}

function base64(pcm: Int16Array): string {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).toString('base64');
}

function wake(amplitude: number): Parameters<PhoneEars['claim']>[1] {
  const preroll = tone(2, amplitude);
  return { phrase: 'hey friday', snippetDbfs: -3, preroll: base64(preroll) };
}

beforeEach(async () => {
  testing = false;
  opened = await testStore();
  clock = new FakeClock(START);
  claims = new WakeClaims({ clock, log: testLogger('claims') });
  online = new Set([CLIENT]);
  sent = [];
  heard = [];
  names = ['Friday'];
  levels = [];
  const rules = new ReachRules(opened.store, () => clock.now());
  registry = new ListeningRegistry({
    store: opened.store,
    rules,
    cameraPauses: (): Promise<ReadonlyMap<string, never>> =>
      Promise.resolve(new Map<string, never>()),
    announce: (): void => undefined,
    connected: (): ReadonlySet<string> => online,
    sendLevel: (_clientId: string, sourceKey: string, dbfs: number): void => {
      levels.push({ sourceKey, dbfs });
    },
    log: testLogger('listening'),
  });
  registry.start();
  pause = new EndOfSpeechPause(opened.store);
  ears = new PhoneEars({
    test: { ...idleWakeTest, active: (): boolean => testing },
    store: opened.store,
    registry,
    claims,
    pause,
    keywords: (spoken, sensitivity): EarKeywords => ({
      keywords: spoken.map((name) => `${name}:${sensitivity}`),
      threshold: 0.15,
      nearMissThreshold: 0.06,
    }),
    speech: {
      segment: (deviceId, segment): void => {
        heard.push({ deviceId, segment });
      },
    },
    names: (): string[] => names,
    online: (): ReadonlySet<string> => online,
    send: (clientId, notice): void => {
      sent.push({ clientId, notice });
    },
    log: testLogger('listening'),
  });
  ears.start();
  phone = device(CLIENT, 'Pixel');
  new DeviceListeningSwitches(opened.store).save(phone, { wake: true });
});

afterEach(async () => {
  ears.stop();
  pause.close();
  registry.stop();
  await opened.close();
});

describe('the ear configuration', () => {
  it('asks a phone that writes nothing down to send speech while a wake test runs', () => {
    expect(ears.config(CLIENT)).toMatchObject({ transcribe: false });
    testing = true;
    expect(ears.config(CLIENT)).toMatchObject({ transcribe: true });
  });

  it('gives a phone its switches, power mode and the hub keyword lines', () => {
    expect(ears.config(CLIENT)).toEqual({
      wake: true,
      transcribe: false,
      sensitivity: 'standard',
      keywords: ['Friday:standard'],
      threshold: 0.15,
      nearMissThreshold: 0.06,
      pause_ms: DEFAULT_PAUSE_MS,
      power_mode: 'always',
    });
  });

  it('gives the phone the home end-of-speech pause and pushes it when it changes', () => {
    expect(ears.config(CLIENT)).toMatchObject({ pause_ms: DEFAULT_PAUSE_MS });
    opened.store.settings.setEndOfSpeechPause(640);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.notice.message).toMatchObject({ kind: 'config', config: { pause_ms: 640 } });
    opened.store.settings.setEndOfSpeechPause(640);
    expect(sent).toHaveLength(1);
  });

  it('starts a phone that was never switched with the wake listener off', () => {
    const fresh = crypto.randomUUID();
    device(fresh, 'Fresh');
    expect(ears.config(fresh)).toMatchObject({ wake: false, transcribe: false });
  });

  it('pushes a changed power mode to the connected phone once', async () => {
    ears.config(CLIENT);
    const viewer = { owner: true, profileId: opened.store.profiles.first().id };
    await registry.change(viewer, phone, { power_mode: 'charging' });
    await registry.change(viewer, phone, { power_mode: 'charging' });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.notice.message).toMatchObject({
      kind: 'config',
      config: { power_mode: 'charging' },
    });
  });

  it('pushes a changed switch once and nothing when nothing changed', async () => {
    ears.config(CLIENT);
    await registry.change({ owner: true, profileId: opened.store.profiles.first().id }, phone, {
      transcribe: true,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.notice.message).toMatchObject({
      kind: 'config',
      config: { wake: true, transcribe: true },
    });
    await registry.change({ owner: true, profileId: opened.store.profiles.first().id }, phone, {
      transcribe: true,
    });
    expect(sent).toHaveLength(1);
  });

  it('does not push to a phone that is not connected', async () => {
    online.clear();
    await registry.change({ owner: true, profileId: opened.store.profiles.first().id }, phone, {
      wake: false,
    });
    expect(sent).toHaveLength(0);
  });

  it('tells the phone when the Listening page starts and stops metering it', () => {
    registry.levels.watch(CLIENT, phone);
    registry.levels.watch(CLIENT, null);
    expect(sent.map((one) => one.notice.message)).toEqual([
      { kind: 'level', watched: true },
      { kind: 'level', watched: false },
    ]);
  });

  it('refuses a client that is not a known phone', () => {
    expect(() => ears.config(crypto.randomUUID())).toThrow(ApiError);
  });
});

describe('wake claims', () => {
  it('grants the first claim and marks the phone in a conversation', async () => {
    expect(ears.claim(CLIENT, wake(8000))).toEqual({ granted: true });
    const { sources } = await registry.view({
      owner: true,
      profileId: opened.store.profiles.first().id,
    });
    expect(sources.find((one) => one.key === phone)?.state).toBe('in_conversation');
  });

  it('measures the loudness from the preroll with the hub formula', () => {
    const preroll = tone(2, 8000);
    ears.claim(CLIENT, { phrase: 'hey friday', snippetDbfs: -3, preroll: base64(preroll) });
    expect(dbfsOfPcm(preroll.subarray(-SAMPLES_PER_SECOND))).toBeCloseTo(-12.2, 1);
    const louder = claims.request({ source: 'camera', key: 'porch', snippetDbfs: -12 });
    expect(louder.granted).toBe(true);
    const quieter = claims.request({ source: 'camera', key: 'door', snippetDbfs: -13 });
    expect(quieter.granted).toBe(false);
  });

  it('tells the phone to end its call when a louder source takes over', () => {
    ears.claim(CLIENT, wake(2000));
    clock.advanceTo(new Date(Date.parse(START) + 400).toISOString());
    claims.request({ source: 'camera', key: 'porch', snippetDbfs: -5 });
    expect(sent.at(-1)).toEqual({
      clientId: CLIENT,
      notice: {
        type: 'listening_ear',
        message: { kind: 'superseded', superseded: { winner: { source: 'camera', key: 'porch' } } },
      },
    });
  });

  it('stands down for a louder camera that claimed first', () => {
    claims.request({ source: 'camera', key: 'porch', snippetDbfs: -3 });
    expect(ears.claim(CLIENT, wake(1000))).toEqual({ granted: false });
  });

  it('refuses the claim of a phone whose wake switch is off', async () => {
    await registry.change({ owner: true, profileId: opened.store.profiles.first().id }, phone, {
      wake: false,
    });
    expect(ears.claim(CLIENT, wake(8000))).toEqual({ granted: false });
  });

  it('falls back to the reported level when no preroll came', () => {
    ears.claim(CLIENT, { phrase: 'hey friday', snippetDbfs: -40, preroll: '' });
    expect(claims.request({ source: 'camera', key: 'porch', snippetDbfs: -39 }).granted).toBe(true);
  });
});

describe('reports', () => {
  const segment = (): Parameters<PhoneEars['report']>[1] => ({
    kind: 'segment',
    segment: {
      at: START,
      endedAt: new Date(Date.parse(START) + 1000).toISOString(),
      levelDbfs: -20,
      pcm: base64(tone(1, 3000)),
    },
  });

  it('hands a segment to the speech writer only while write-down is on', async () => {
    ears.report(CLIENT, segment());
    expect(heard).toHaveLength(0);
    await registry.change({ owner: true, profileId: opened.store.profiles.first().id }, phone, {
      transcribe: true,
    });
    ears.report(CLIENT, segment());
    expect(heard).toHaveLength(1);
    expect(heard[0]?.segment).toMatchObject({
      startedAt: Date.parse(START),
      endedAt: Date.parse(START) + 1000,
    });
    expect(heard[0]?.segment.pcm).toHaveLength(SAMPLES_PER_SECOND);
  });

  it('refuses audio that is not whole 16-bit samples', async () => {
    await registry.change({ owner: true, profileId: opened.store.profiles.first().id }, phone, {
      transcribe: true,
    });
    expect(() => {
      ears.report(CLIENT, { kind: 'segment', segment: { ...segmentOf(), pcm: 'AAAA' } });
    }).toThrow(ApiError);
  });

  it('shows a missing microphone permission and clears it when the phone says so', async () => {
    const viewer = { owner: true, profileId: opened.store.profiles.first().id };
    ears.report(CLIENT, { kind: 'state', state: 'needs_permission' });
    expect((await registry.source(viewer, phone)).state).toBe('needs_permission');
    ears.report(CLIENT, { kind: 'state', state: null });
    expect((await registry.source(viewer, phone)).state).toBe('listening');
  });

  it('forwards the microphone level to the page that watches it', () => {
    registry.levels.watch(CLIENT, phone);
    ears.report(CLIENT, { kind: 'level', dbfs: -33 });
    expect(levels).toEqual([{ sourceKey: phone, dbfs: -33 }]);
  });
});

function segmentOf(): Extract<Parameters<PhoneEars['report']>[1], { kind: 'segment' }>['segment'] {
  return {
    at: START,
    endedAt: START,
    levelDbfs: -20,
    pcm: base64(tone(1, 3000)),
  };
}
