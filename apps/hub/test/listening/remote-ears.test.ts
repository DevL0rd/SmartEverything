import type {
  ComputerFeature,
  EarSource,
  ListeningRuntimeState,
  PauseChoiceMs,
  WakeSensitivity,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { base64OfPcm } from '../../src/computers/ear-pcm';
import { EarHosts, type EarHostFrame } from '../../src/listening/ear-hosts';
import { HubRemoteEars, EarKeyConflictError } from '../../src/listening/remote-ears';
import type { RemoteEarOptions } from '../../src/listening/remote-ears-port';
import { WakeClaims, type OnSuperseded } from '../../src/wake-name/wake-claims';
import type { SpeechSegment } from '../../src/listening/speech-segment';
import type { EarKeywords } from '../../src/wake-name/keyword-lines';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const CAN: readonly ComputerFeature[] = ['cpu', 'ear_host'];
const CAMERA = 'cam-1';
const START = '2026-10-18T10:00:00.000Z';

interface Woke {
  readonly phrase: string;
  readonly words: () => Int16Array;
  readonly onSuperseded: OnSuperseded;
}

let logs: CapturedLogs;
let opened: TestStore;
let clock: FakeClock;
let hosts: EarHosts;
let claims: WakeClaims;
let ears: HubRemoteEars;
let pause: { ms: PauseChoiceMs; listeners: (() => void)[] };
let frames: Record<string, EarHostFrame[]>;
let states: [string, ListeningRuntimeState | null][];
let nears: { kind: string; key: string; phrase: string }[];
let woke: Woke[];
let segments: SpeechSegment[];
let resting: boolean;
let sensitivity: WakeSensitivity;

function computerDevice(name: string): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: `computer-${name}`,
      parentId: null,
      kind: 'computer',
      name,
      model: 'm',
      manufacturer: 'm',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

function later(ms: number): void {
  clock.advanceTo(new Date(clock.now().getTime() + ms).toISOString());
}

function join(computerId: string): void {
  frames[computerId] = [];
  hosts.join(computerId, CAN, (frame) => frames[computerId]?.push(frame));
}

function options(source: EarSource, claim: RemoteEarOptions['claim']): RemoteEarOptions {
  return {
    source,
    codec: 'opus_48k_mono',
    claim,
    fields: { cameraId: claim.key },
    sensitivity: () => sensitivity,
    resting: () => resting,
    wake: (phrase, words, onSuperseded): void => {
      woke.push({ phrase, words, onSuperseded });
    },
    speech: (segment): void => {
      segments.push(segment);
    },
  };
}

function camera(): RemoteEarOptions {
  return options({ kind: 'camera', key: CAMERA }, { source: 'camera', key: CAMERA });
}

function pcm(...samples: number[]): Int16Array {
  return Int16Array.from(samples);
}

function claimOf(snippetDbfs: number): {
  kind: 'claim';
  claim: { phrase: string; snippetDbfs: number; preroll: string };
} {
  return {
    kind: 'claim',
    claim: { phrase: 'Sam', snippetDbfs, preroll: base64OfPcm(pcm(1, 2, 3, 4)) },
  };
}

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
  clock = new FakeClock(START);
  hosts = new EarHosts({ store: opened.store, log: testLogger('listening') });
  hosts.start();
  claims = new WakeClaims({ clock, log: testLogger('wake') });
  pause = { ms: 200, listeners: [] };
  frames = {};
  states = [];
  nears = [];
  woke = [];
  segments = [];
  resting = false;
  sensitivity = 'standard';
  ears = new HubRemoteEars({
    hosts,
    claims,
    test: {
      near: (source, phrase): void => {
        nears.push({ kind: source.kind, key: source.key, phrase });
      },
    },
    pause: {
      ms: (): PauseChoiceMs => pause.ms,
      onChange: (listener): (() => void) => {
        pause.listeners.push(listener);
        return (): void => undefined;
      },
    },
    names: (): string[] => ['Sam'],
    keywords: (names, level): EarKeywords => ({
      keywords: names.map((name) => `${name} ${level}`),
      threshold: 0.25,
      nearMissThreshold: 0.1,
    }),
    clock,
    log: testLogger('listening'),
  });
  ears.start();
  ears.onState(({ key, state }) => states.push([key, state]));
});

afterEach(async () => {
  ears.stop();
  hosts.close();
  await opened.close();
});

describe('a source with no computer to listen', () => {
  it('shows the needs-a-computer state and sends no audio', async () => {
    const ear = await ears.open(camera());
    ear.packet(new Uint8Array([1, 2, 3]));
    expect(states).toEqual([[CAMERA, 'no_host']]);
  });

  it('opens on the host as soon as one comes online and clears the state', async () => {
    const ear = await ears.open(camera());
    join('desk');
    ear.packet(new Uint8Array([9]));
    expect(frames['desk']).toEqual([
      {
        type: 'ears_open',
        source: { kind: 'camera', key: CAMERA },
        codec: 'opus_48k_mono',
        config: {
          wake: true,
          transcribe: true,
          keywords: ['Sam standard'],
          threshold: 0.25,
          nearMissThreshold: 0.1,
          sensitivity: 'standard',
          pause_ms: 200,
        },
      },
      { type: 'ears_audio', key: CAMERA, packets: [Buffer.from([9]).toString('base64')] },
    ]);
    expect(states).toEqual([
      [CAMERA, 'no_host'],
      [CAMERA, null],
    ]);
  });

  it('shows the state again when the host goes away', async () => {
    join('desk');
    await ears.open(camera());
    hosts.leave('desk');
    expect(states).toEqual([[CAMERA, 'no_host']]);
  });
});

describe('moving between hosts', () => {
  it('closes the source on the old host and opens it on the one the owner picks', async () => {
    const [first = '', second = ''] = [computerDevice('Desk'), computerDevice('Studio')].sort();
    join(first);
    join(second);
    await ears.open(camera());
    opened.store.settings.setEarHost(second);
    expect(frames[first]?.map((frame) => frame.type)).toEqual(['ears_open', 'ears_close']);
    expect(frames[second]?.map((frame) => frame.type)).toEqual(['ears_open']);
  });

  it('opens each source once on the new host after the host is lost', async () => {
    join('alpha');
    await ears.open(camera());
    await ears.open(options({ kind: 'talk', key: 'msg-1' }, { source: 'talk', key: 'room' }));
    join('beta');
    hosts.leave('alpha');
    expect(frames['beta']?.map((frame) => frame.type)).toEqual(['ears_open', 'ears_open']);
  });
});

describe('a source that cannot be configured', () => {
  it('names the source and keeps the other sources moving to the new host', async () => {
    let broken = false;
    await ears.open({
      ...camera(),
      sensitivity: (): WakeSensitivity => {
        if (broken) throw new Error('no camera row');
        return sensitivity;
      },
    });
    await ears.open(options({ kind: 'talk', key: 'msg-1' }, { source: 'talk', key: 'room' }));
    broken = true;
    join('desk');
    expect(frames['desk']?.map((frame) => frame.type)).toEqual(['ears_open']);
    expect(frames['desk']?.[0]).toMatchObject({ source: { kind: 'talk', key: 'msg-1' } });
    expect(logs.events()).toContain('ears.attach_failed');
  });
});

describe('a node link that drops while a source attaches', () => {
  it('opens the source without an attach failure and keeps the other sources moving', async () => {
    await ears.open(camera());
    await ears.open(options({ kind: 'talk', key: 'msg-1' }, { source: 'talk', key: 'room' }));
    hosts.join('desk', CAN, () => {
      throw new Error('link closed');
    });
    expect(logs.events()).not.toContain('ears.attach_failed');
    expect(logs.events()).toContain('ears.send_failed');
  });
});

describe('what the host hears', () => {
  beforeEach(() => {
    join('desk');
  });

  it('turns a wake into a claim under the original source and hands over the preroll once', async () => {
    await ears.open(camera());
    hosts.relayed('desk', CAMERA, claimOf(-30));
    expect(woke.map((one) => one.phrase)).toEqual(['Sam']);
    expect(Array.from(woke[0]?.words() ?? [])).toEqual([1, 2, 3, 4]);
    expect(Array.from(woke[0]?.words() ?? [])).toEqual([]);
    claims.request({ source: 'computer', key: 'desk', snippetDbfs: -80 });
    expect(frames['desk']?.at(-1)).toEqual({
      type: 'ears',
      key: CAMERA,
      ear: { kind: 'superseded', superseded: { winner: { source: 'computer', key: 'desk' } } },
    });
  });

  it('stands down for a computer claim that wins and tells the camera call', async () => {
    await ears.open(camera());
    hosts.relayed('desk', CAMERA, claimOf(-30));
    const stopped: string[] = [];
    woke[0]?.onSuperseded((winner) => stopped.push(`${winner.source}:${winner.key}`));
    claims.request({ source: 'computer', key: 'desk', snippetDbfs: -80 });
    expect(stopped).toEqual(['computer:desk']);
  });

  it('tells a late listener who already won', async () => {
    await ears.open(camera());
    hosts.relayed('desk', CAMERA, claimOf(-30));
    claims.request({ source: 'talk', key: 'room', snippetDbfs: -90 });
    const stopped: string[] = [];
    woke[0]?.onSuperseded((winner) => stopped.push(winner.source));
    expect(stopped).toEqual(['talk']);
  });

  it('refuses a quieter camera claim after a louder one, like a local ear would', async () => {
    await ears.open(camera());
    claims.request({ source: 'camera', key: 'other', snippetDbfs: -10 });
    hosts.relayed('desk', CAMERA, claimOf(-40));
    expect(woke).toEqual([]);
  });

  it('hands finished speech to the source', async () => {
    await ears.open(camera());
    hosts.relayed('desk', CAMERA, {
      kind: 'segment',
      segment: {
        at: '2026-10-18T10:00:01.000Z',
        endedAt: '2026-10-18T10:00:03.000Z',
        levelDbfs: -30,
        pcm: base64OfPcm(pcm(5, 6)),
      },
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      startedAt: Date.parse('2026-10-18T10:00:01.000Z'),
      endedAt: Date.parse('2026-10-18T10:00:03.000Z'),
    });
    expect(Array.from(segments[0]?.pcm ?? [])).toEqual([5, 6]);
  });

  it('marks a near miss for the wake test of a camera only', async () => {
    await ears.open(camera());
    await ears.open(options({ kind: 'talk', key: 'msg-1' }, { source: 'talk', key: 'room' }));
    hosts.relayed('desk', CAMERA, { kind: 'near', phrase: 'Sam' });
    hosts.relayed('desk', 'msg-1', { kind: 'near', phrase: 'Sam' });
    expect(nears).toEqual([{ kind: 'camera', key: CAMERA, phrase: 'Sam' }]);
  });

  it('shows what the host reports about its ear', async () => {
    await ears.open(camera());
    hosts.relayed('desk', CAMERA, { kind: 'state', state: 'needs_permission' });
    expect(states.at(-1)).toEqual([CAMERA, 'needs_permission']);
    hosts.relayed('desk', CAMERA, { kind: 'state', state: null });
    expect(states.at(-1)).toEqual([CAMERA, null]);
  });

  it('ignores a computer that is not the host of that source and unknown keys', async () => {
    join('other');
    await ears.open(camera());
    hosts.relayed('other', CAMERA, claimOf(-30));
    hosts.relayed('desk', 'nobody', claimOf(-30));
    expect(woke).toEqual([]);
  });

  it('ignores a claim while resting or when wake is switched off', async () => {
    let wakes = true;
    await ears.open({ ...camera(), wakes: () => wakes });
    wakes = false;
    hosts.relayed('desk', CAMERA, claimOf(-30));
    wakes = true;
    resting = true;
    hosts.relayed('desk', CAMERA, claimOf(-30));
    expect(woke).toEqual([]);
  });
});

describe('resting and settings', () => {
  beforeEach(() => {
    join('desk');
  });

  it('sends rest once while busy, no audio, and the config again when free', async () => {
    const ear = await ears.open(camera());
    resting = true;
    ear.packet(new Uint8Array([1]));
    ear.packet(new Uint8Array([2]));
    resting = false;
    ear.packet(new Uint8Array([3]));
    expect(frames['desk']?.map((frame) => frame.type)).toEqual([
      'ears_open',
      'ears',
      'ears',
      'ears_audio',
    ]);
    expect(frames['desk']?.[1]).toMatchObject({ ear: { kind: 'rest', reason: 'conversation' } });
    expect(frames['desk']?.[2]).toMatchObject({ ear: { kind: 'config' } });
  });

  it('opens already resting when the source is busy', async () => {
    resting = true;
    await ears.open(camera());
    expect(frames['desk']?.map((frame) => frame.type)).toEqual(['ears_open', 'ears']);
  });

  it('sends the new end-of-speech pause at once', async () => {
    await ears.open(camera());
    pause.ms = 320;
    pause.listeners.forEach((listener) => {
      listener();
    });
    expect(frames['desk']?.at(-1)).toMatchObject({
      type: 'ears',
      ear: { kind: 'config', config: { pause_ms: 320 } },
    });
  });

  it('re-reads sensitivity at most once a second as audio arrives', async () => {
    const ear = await ears.open(camera());
    sensitivity = 'high';
    ear.packet(new Uint8Array([1]));
    expect(frames['desk']?.map((frame) => frame.type)).toEqual(['ears_open', 'ears_audio']);
    later(1000);
    ear.packet(new Uint8Array([2]));
    expect(frames['desk']?.map((frame) => frame.type)).toEqual([
      'ears_open',
      'ears_audio',
      'ears',
      'ears_audio',
    ]);
    expect(frames['desk']?.[2]).toMatchObject({
      ear: { kind: 'config', config: { sensitivity: 'high' } },
    });
  });

  it('tells the node when only speech is wanted', async () => {
    await ears.open({ ...camera(), wake: null });
    expect(frames['desk']?.[0]).toMatchObject({ config: { wake: false, transcribe: true } });
  });
});

describe('opening and closing', () => {
  it('closes on the host, waits for it to say closed, then frees the key and the state', async () => {
    join('desk');
    const ear = await ears.open(camera());
    let closed = false;
    const closing = ear.close().then(() => {
      closed = true;
    });
    ear.packet(new Uint8Array([1]));
    await Promise.resolve();
    expect(closed).toBe(false);
    hosts.relayed('desk', CAMERA, { kind: 'closed' });
    await closing;
    expect(closed).toBe(true);
    expect(frames['desk']?.map((frame) => frame.type)).toEqual(['ears_open', 'ears_close']);
    hosts.relayed('desk', CAMERA, claimOf(-30));
    expect(woke).toEqual([]);
  });

  it('still hands over the speech the host finishes while it is closing', async () => {
    join('desk');
    const ear = await ears.open(camera());
    const closing = ear.close();
    hosts.relayed('desk', CAMERA, {
      kind: 'segment',
      segment: {
        at: '2026-10-18T10:00:01.000Z',
        endedAt: '2026-10-18T10:00:03.000Z',
        levelDbfs: -30,
        pcm: base64OfPcm(pcm(7, 8)),
      },
    });
    hosts.relayed('desk', CAMERA, { kind: 'closed' });
    await closing;
    expect(segments.map((one) => Array.from(one.pcm))).toEqual([[7, 8]]);
  });

  it('stops waiting when the host goes away while closing', async () => {
    join('desk');
    const ear = await ears.open(camera());
    const closing = ear.close();
    hosts.leave('desk');
    await closing;
    await expect(ear.close()).resolves.toBeUndefined();
  });

  it('stops waiting when the host moves while closing', async () => {
    join('desk');
    const ear = await ears.open(camera());
    const closing = ear.close();
    join('studio');
    hosts.leave('desk');
    await closing;
    expect(frames['studio']).toEqual([]);
  });

  it('closes at once when no computer hosts the source', async () => {
    const ear = await ears.open(camera());
    await expect(ear.close()).resolves.toBeUndefined();
    expect(states.at(-1)).toEqual([CAMERA, null]);
  });

  it('replaces an ear that is opened again for the same source once the host has closed it', async () => {
    join('desk');
    await ears.open(camera());
    const reopened = ears.open(camera());
    hosts.relayed('desk', CAMERA, { kind: 'closed' });
    await reopened;
    expect(frames['desk']?.map((frame) => frame.type)).toEqual([
      'ears_open',
      'ears_close',
      'ears_open',
    ]);
  });

  it('refuses a key that another kind of source already uses', async () => {
    await ears.open(camera());
    await expect(
      ears.open(options({ kind: 'talk', key: CAMERA }, { source: 'talk', key: 'room' })),
    ).rejects.toBeInstanceOf(EarKeyConflictError);
  });

  it('does nothing for a source that neither wakes nor writes down', async () => {
    join('desk');
    const ear = await ears.open({ ...camera(), wake: null, speech: null });
    ear.packet(new Uint8Array([1]));
    await ear.close();
    expect(frames['desk']).toEqual([]);
    expect(states).toEqual([]);
  });

  it('closes every open source when the hub stops', async () => {
    join('desk');
    await ears.open(camera());
    ears.stop();
    expect(frames['desk']?.map((frame) => frame.type)).toEqual(['ears_open', 'ears_close']);
  });

  it('keeps sources of one listening row together in its state', async () => {
    await ears.open(options({ kind: 'talk', key: 'm1' }, { source: 'talk', key: 'room' }));
    await ears.open(options({ kind: 'talk', key: 'm2' }, { source: 'talk', key: 'room' }));
    join('desk');
    expect(states).toEqual([
      ['room', 'no_host'],
      ['room', null],
    ]);
  });
});
