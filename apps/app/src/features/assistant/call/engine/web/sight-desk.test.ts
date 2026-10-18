import {
  sightOfFrame,
  type AssistantVoiceClientMessage,
  type AssistantVoiceServerMessage,
  type CallCapabilities,
  type SightFrame,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubToolResult } from '../../../../../../../hub/src/ai-tools/hub-tool';
import { CallSight } from '../../../../../../../hub/src/assistant-voice/call-sight';

const CALL = '6c1c4f32-0b8e-4c55-9d7a-2b1f8f6a1e01';
const LOOK = '0a5e61f4-2d77-4a52-8d2e-5c0f8b8f7a10';
const OTHER_LOOK = '5d3b1f7e-6a9c-4c1d-8f2e-9b7a3c4d5e60';
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);

interface Fakes {
  readonly chosen: (string | null)[];
  stopped: number;
  shown: number;
  denied: boolean;
  gate: Promise<void>;
}

const fakes = vi.hoisted((): Fakes => ({
  chosen: [],
  stopped: 0,
  shown: 0,
  denied: false,
  gate: Promise.resolve(),
}));

vi.mock('../../call-state', () => ({ changeVideo: vi.fn() }));
vi.mock('../../preview-store', () => ({ callPreviews: { set: vi.fn() } }));
vi.mock('./desktop-choice', () => ({
  chooseDesktopSource: (_source: string, target: string | null): Promise<void> => {
    fakes.chosen.push(target);
    return Promise.resolve();
  },
}));
vi.mock('./sight-devices', () => ({
  openCamera: vi.fn(),
  stopStream: (): void => {
    fakes.stopped += 1;
  },
  openScreen: async (): Promise<unknown> => {
    await fakes.gate;
    fakes.shown += 1;
    if (fakes.denied) {
      throw new Error('declined');
    }
    return {
      source: 'desktop_screen',
      label: 'Computer screen',
      facing: null,
      stream: { getVideoTracks: () => [{ addEventListener: vi.fn() }] },
    };
  },
}));
vi.mock('./sight-sampler', () => ({
  SightSampler: class {
    setStreaming = vi.fn();
    stop = vi.fn();
    still = (): Promise<Uint8Array> => Promise.resolve(JPEG);
  },
}));

const { SightDesk } = await import('./sight-desk');

const HUB: CallCapabilities = {
  type: 'capabilities',
  sight: ['desktop_screen', 'desktop_window'],
  still: true,
  interrupt: true,
  resume: true,
  maxFrameBytes: 400_000,
  minFrameIntervalMs: 500,
};

function nothing(): void {
  return undefined;
}

let toHub: AssistantVoiceClientMessage[];
let pictures: SightFrame[];
let order: string[];
let hubSent: AssistantVoiceServerMessage[];
let hub: CallSight;
let desk: InstanceType<typeof SightDesk>;
let hubLogs: { event: string; why: unknown }[];

function deliver(): void {
  for (const message of toHub.splice(0)) {
    if (message.type === 'sight_start') {
      hub.start(message);
    } else if (message.type === 'sight_still') {
      hub.announce(message);
    } else if (message.type === 'sight_stop') {
      hub.stop(message.source, 'requested');
    }
  }
}

beforeEach(() => {
  fakes.chosen.length = 0;
  fakes.stopped = 0;
  fakes.shown = 0;
  fakes.denied = false;
  fakes.gate = Promise.resolve();
  toHub = [];
  pictures = [];
  order = [];
  hubSent = [];
  hubLogs = [];
  const log = new Logger('hub.voice');
  Logger.reset();
  Logger.configure({
    level: 'trace',
    sink: (record): void => {
      hubLogs.push({ event: record.event, why: record.payload['why'] });
    },
  });
  hub = new CallSight({
    callId: CALL,
    send: (message): void => {
      hubSent.push(message);
    },
    video: nothing,
    note: nothing,
    tune: nothing,
    record: nothing,
    delegate: (): Promise<HubToolResult> =>
      Promise.resolve({ response: {}, line: '', pictures: [] }),
    cameras: { name: (): string => 'camera', watch: (): (() => void) => nothing },
    blocked: (): null => null,
    now: (): Date => new Date(0),
    time: (): string => '00:00',
    log,
  });
  desk = new SightDesk({
    callId: (): string => CALL,
    hub: (): CallCapabilities => HUB,
    mode: (): 'live' => 'live',
    facing: (): 'front' => 'front',
    open: (): boolean => true,
    message: (message): void => {
      order.push(message.type);
      toHub.push(message);
    },
    picture: (bytes): void => {
      const frame = sightOfFrame(bytes);
      order.push(frame.still ? 'still' : 'frame');
      pictures.push(frame);
      deliver();
      hub.frame(frame);
    },
    failure: nothing,
  });
});

function dropped(): unknown[] {
  return hubLogs
    .filter((entry) => entry.event === 'voice.sight_frame_dropped')
    .map((entry) => entry.why);
}

describe('looking at the desktop screen', () => {
  it('opens one share that the hub confirms before the first picture and drops nothing', async () => {
    await desk.look({ source: 'desktop_screen', target: null, lookId: LOOK });
    expect(order).toEqual(['sight_start', 'sight_still', 'still']);
    expect(hub.row).toMatchObject({ source: 'desktop_screen', label: 'Computer screen' });
    expect(dropped()).toEqual([]);
  });

  it('answers a later look from the open share without opening or asking again', async () => {
    await desk.look({ source: 'desktop_screen', target: null, lookId: LOOK });
    await desk.look({ source: 'desktop_screen', target: null, lookId: OTHER_LOOK });
    expect(fakes.shown).toBe(1);
    expect(order.filter((type) => type === 'sight_start')).toHaveLength(1);
    expect(order.filter((type) => type === 'still')).toHaveLength(2);
    expect(dropped()).toEqual([]);
  });

  it('joins a share that is still opening instead of asking a second time', async () => {
    let release: () => void = () => undefined;
    fakes.gate = new Promise((resolve) => {
      release = resolve;
    });
    const started = desk.start('desktop_screen', null, null);
    const looked = desk.look({ source: 'desktop_screen', target: null, lookId: LOOK });
    const again = desk.start('desktop_screen', null, null);
    release();
    await Promise.all([started, looked, again]);
    expect(fakes.shown).toBe(1);
    expect(order.filter((type) => type === 'sight_start')).toHaveLength(1);
    expect(dropped()).toEqual([]);
  });

  it('chooses the named window before the share opens', async () => {
    await desk.start('desktop_window', null, 'window:7:0');
    expect(fakes.chosen).toEqual(['window:7:0']);
  });

  it('refuses a look when the person declines the share and sends nothing to the hub', async () => {
    fakes.denied = true;
    await expect(
      desk.look({ source: 'desktop_screen', target: null, lookId: LOOK }),
    ).rejects.toThrow('declined');
    expect(order).toEqual([]);
  });

  it('tells the hub when the person stops the share and ends it with the call', async () => {
    await desk.look({ source: 'desktop_screen', target: null, lookId: LOOK });
    desk.stop('desktop_screen', true);
    deliver();
    expect(hub.row).toBeNull();
    expect(hubSent.at(-1)).toMatchObject({
      type: 'sight_state',
      state: 'off',
      reason: 'requested',
    });
    await desk.look({ source: 'desktop_screen', target: null, lookId: OTHER_LOOK });
    desk.stopAll();
    expect(fakes.stopped).toBeGreaterThanOrEqual(2);
  });
});
