import {
  SIGHT_FRAME_LIMITS,
  type AssistantVoiceClientMessage,
  type AssistantVoiceServerMessage,
  type SightFrame,
} from '@smarteverything/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { CallSight } from '../../src/assistant-voice/call-sight';
import type { HubToolResult } from '../../src/ai-tools/hub-tool';
import type { Picture } from '../../src/assistant-voice/gemini';
import { SightError } from '../../src/assistant-voice/sight-error';
import type { SightTuning } from '../../src/assistant-voice/live-window';
import type { VideoFrame } from '../../src/assistant-voice/video';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const CALL = crypto.randomUUID();
const START = Date.parse('2026-10-08T10:00:00.000Z');
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const CAMERA_ID = crypto.randomUUID();

type Settings = Extract<AssistantVoiceClientMessage, { type: 'sight_settings' }>;
type Start = Extract<AssistantVoiceClientMessage, { type: 'sight_start' }>;

let logs: CapturedLogs;
let clock: number;
let sight: CallSight;
let sent: AssistantVoiceServerMessage[];
let video: VideoFrame[];
let notes: { text: string; picture: Picture | undefined; respond: boolean | undefined }[];
let tuned: (SightTuning | null)[];
let recorded: string[];
let blocked: string | null;
let watchers: ((frame: VideoFrame) => void)[];
let detached: number;

function settings(overrides: Partial<Omit<Settings, 'type' | 'callId'>> = {}): Settings {
  return {
    type: 'sight_settings',
    callId: CALL,
    mode: 'live',
    memorySeconds: 15,
    look: ['phone_screen'],
    available: ['phone_screen', 'phone_camera'],
    ...overrides,
  };
}

function start(source: Start['source'] = 'phone_screen', label?: string): Start {
  return {
    type: 'sight_start',
    callId: CALL,
    source,
    ...(label === undefined ? {} : { label }),
  };
}

function frame(source: SightFrame['source'], still = false): SightFrame {
  return { source, still, jpeg: JPEG };
}

function states(): Extract<AssistantVoiceServerMessage, { type: 'sight_state' }>[] {
  return sent.flatMap((message) => (message.type === 'sight_state' ? [message] : []));
}

beforeEach(() => {
  logs = captureLogs();
  clock = START;
  sent = [];
  video = [];
  notes = [];
  tuned = [];
  recorded = [];
  blocked = null;
  watchers = [];
  detached = 0;
  sight = new CallSight({
    callId: CALL,
    own: () => ({ source: null, computerId: null }),
    send: (message): void => {
      sent.push(message);
    },
    video: (next): void => {
      video.push(next);
    },
    note: (text, picture, respond): void => {
      notes.push({ text, picture, respond });
    },
    tune: (tuning): void => {
      tuned.push(tuning);
    },
    record: (text): void => {
      recorded.push(text);
    },
    delegate: (): Promise<HubToolResult> =>
      Promise.resolve({ response: {}, line: '', pictures: [] }),
    cameras: {
      name: (cameraId): string => {
        if (cameraId !== CAMERA_ID) {
          throw new SightError('failed', 'There is no such camera.');
        }
        return 'Garage';
      },
      watch: (_cameraId, listener): (() => void) => {
        watchers.push(listener);
        return (): void => {
          detached += 1;
        };
      },
    },
    blocked: (): string | null => blocked,
    now: (): Date => new Date(clock),
    time: (at): string => at.toISOString().slice(11, 16),
    log: testLogger('voice'),
  });
});

describe('sharing a source', () => {
  it('turns on, tells the app, tells the assistant and tunes the live session', () => {
    sight.settings(settings());
    sight.start(start('phone_screen', 'My phone'));
    expect(sight.row).toEqual({ source: 'phone_screen', label: 'My phone', mode: 'live' });
    expect(states().at(-1)).toMatchObject({
      source: 'phone_screen',
      state: 'on',
      label: 'My phone',
    });
    expect(notes.at(-1)?.text).toContain('Pictures reach you about once a second');
    expect(tuned.at(-1)).toEqual({ mode: 'live', resolution: 'medium', memorySeconds: 15 });
  });

  it('uses the source name when the app sends no label, and a lower resolution for a camera', () => {
    sight.start(start('phone_camera'));
    expect(states().at(-1)?.label).toBe('Phone camera');
    expect(tuned.at(-1)?.resolution).toBe('low');
  });

  it('replaces what was shared before without telling the assistant they stopped', () => {
    sight.start(start('phone_screen'));
    sight.start(start('phone_camera'));
    expect(states().map((state) => [state.source, state.state, state.reason])).toEqual([
      ['phone_screen', 'on', null],
      ['phone_screen', 'off', 'replaced'],
      ['phone_camera', 'on', null],
    ]);
    expect(notes.some((note) => note.text.includes('stopped showing'))).toBe(false);
    expect(recorded).toHaveLength(1);
  });

  it('stops on request, records the shared span and tells the assistant', () => {
    sight.start(start('phone_screen'));
    clock += 90_000;
    sight.stop('phone_screen', 'stopped');
    expect(sight.row).toBeNull();
    expect(states().at(-1)).toMatchObject({ state: 'off', reason: 'stopped' });
    expect(recorded).toEqual(['Shared their phone screen 10:00–10:01']);
    expect(notes.at(-1)?.text).toBe('[They stopped showing you their phone screen.]');
    sight.stop('phone_camera', 'stopped');
    expect(states()).toHaveLength(2);
  });

  it('stopLooking answers differently when nothing is shown', () => {
    expect(sight.stopLooking()).toEqual({
      response: { status: 'nothing is being shown right now' },
      line: '',
      pictures: [],
    });
    sight.start(start());
    expect(sight.stopLooking()).toMatchObject({
      response: { status: 'stopped' },
      line: 'Stopped looking',
    });
    expect(sight.row).toBeNull();
  });

  it('refuses to start and says why when the call has reached its budget', () => {
    blocked = 'The daily limit was reached.';
    sight.start(start());
    expect(sight.row).toBeNull();
    expect(states().at(-1)).toMatchObject({
      state: 'off',
      reason: 'budget',
      detail: 'The daily limit was reached.',
    });
  });

  it('stops by itself when the budget is reached while sharing', () => {
    sight.start(start());
    sight.budgetReached('Out of budget.');
    expect(sight.row).toBeNull();
    expect(states().at(-1)).toMatchObject({ reason: 'budget', detail: 'Out of budget.' });
  });

  it('restates the current state for a reconnecting app', () => {
    sight.restate();
    expect(sent).toEqual([]);
    sight.start(start('phone_screen', 'My phone'));
    sent.length = 0;
    sight.restate();
    expect(states()).toHaveLength(1);
    expect(states()[0]).toMatchObject({ state: 'on', label: 'My phone' });
  });
});

describe('streaming frames', () => {
  beforeEach(() => {
    sight.settings(settings());
    sight.start(start('phone_screen'));
  });

  it('passes live pictures of the shared source on to the model', () => {
    sight.frame(frame('phone_screen'));
    expect(video).toHaveLength(1);
    expect(video[0]).toMatchObject({ mimeType: 'image/jpeg' });
    expect([...(video[0]?.data ?? [])]).toEqual([...JPEG]);
  });

  it('drops pictures that come faster than the minimum interval', () => {
    sight.frame(frame('phone_screen'));
    clock += SIGHT_FRAME_LIMITS.minIntervalMs - 1;
    sight.frame(frame('phone_screen'));
    clock += 1;
    sight.frame(frame('phone_screen'));
    expect(video).toHaveLength(2);
  });

  it('drops pictures of a source that is not being shared', () => {
    sight.frame(frame('phone_camera'));
    expect(video).toEqual([]);
  });

  it('streams nothing in on-demand mode', () => {
    sight.settings(settings({ mode: 'on_demand' }));
    sight.frame(frame('phone_screen'));
    expect(video).toEqual([]);
  });

  it('warns once about dropped pictures and again in total when the call ends', () => {
    sight.frame(frame('phone_camera'));
    sight.frame(frame('phone_camera'));
    sight.end();
    expect(logs.events().filter((event) => event === 'voice.sight_frame_dropped')).toHaveLength(1);
    expect(
      logs.records.find((record) => record.event === 'voice.sight_frames_dropped'),
    ).toMatchObject({
      payload: { count: 2 },
    });
  });

  it('turns the share off when the budget is reached on a later picture', () => {
    blocked = 'Out of budget.';
    sight.frame(frame('phone_screen'));
    expect(video).toEqual([]);
    expect(sight.row).toBeNull();
    expect(states().at(-1)).toMatchObject({ reason: 'budget' });
  });
});

describe('settings during a share', () => {
  it('tells the assistant when the mode changes while sharing', () => {
    sight.settings(settings());
    sight.start(start('phone_screen'));
    sight.settings(settings({ mode: 'on_demand' }));
    expect(notes.at(-1)?.text).toContain('Nothing streams');
    expect(tuned.at(-1)).toMatchObject({ mode: 'on_demand' });
    expect(sight.row?.mode).toBe('on_demand');
  });

  it('does not tune the live session before anything was shared or looked at', () => {
    sight.settings(settings());
    expect(tuned.at(-1)).toBeNull();
  });
});

describe('watching a home camera', () => {
  it('streams the camera while live and stops its stream when the mode turns on-request', () => {
    sight.settings(settings());
    sight.watch(CAMERA_ID);
    expect(sight.row).toEqual({ source: 'home_camera', label: 'Garage', mode: 'live' });
    expect(watchers).toHaveLength(1);
    watchers[0]?.({ data: Buffer.from(JPEG), mimeType: 'image/jpeg' });
    expect(video).toHaveLength(1);
    sight.settings(settings({ mode: 'on_demand' }));
    expect(detached).toBe(1);
    sight.settings(settings({ mode: 'live' }));
    expect(watchers).toHaveLength(2);
  });

  it('detaches from the camera when the share ends', () => {
    sight.settings(settings());
    sight.watch(CAMERA_ID);
    sight.stop('home_camera', 'stopped');
    expect(detached).toBe(1);
    sight.watch(CAMERA_ID);
    sight.end();
    expect(detached).toBe(2);
  });

  it('refuses a camera the home does not have and does not start', () => {
    expect(() => {
      sight.watch(crypto.randomUUID());
    }).toThrow(SightError);
    expect(sight.row).toBeNull();
  });

  it('says budget when the call cannot afford to watch', () => {
    blocked = 'No budget.';
    sight.watch(CAMERA_ID);
    expect(states().at(-1)).toMatchObject({
      source: 'home_camera',
      reason: 'budget',
      label: 'Garage',
    });
  });
});

describe('pictures the person sends on purpose', () => {
  const still = {
    type: 'sight_still',
    callId: CALL,
    source: 'phone_screen',
    label: 'Receipt',
    lookId: crypto.randomUUID(),
  } as const;

  it('shows an announced still to the assistant', () => {
    sight.announce(still);
    sight.frame(frame('phone_screen', true));
    expect(notes.at(-1)).toMatchObject({
      text: '[They showed you Receipt just now: look at this picture when you answer.]',
      respond: false,
    });
    expect(sent.at(-1)).toMatchObject({
      type: 'sight_looked',
      trigger: 'person',
      lookId: still.lookId,
    });
  });

  it('drops a still nobody announced, or one from another source', () => {
    sight.frame(frame('phone_screen', true));
    sight.announce(still);
    sight.frame(frame('phone_camera', true));
    sight.frame(frame('phone_screen', true));
    expect(notes).toEqual([]);
  });

  it('refuses a still when the budget is reached', () => {
    blocked = 'No budget.';
    sight.announce(still);
    sight.frame(frame('phone_screen', true));
    expect(notes).toEqual([]);
    expect(states().at(-1)).toMatchObject({ reason: 'budget', label: 'Receipt' });
  });

  it('answers a pending look when the still is the capture the assistant asked for', async () => {
    sight.settings(settings({ available: ['phone_screen'], look: ['phone_screen'] }));
    const answer = sight.see({ source: 'phone_screen', why: 'to read it' });
    const capture = sent.find((message) => message.type === 'sight_capture');
    if (capture?.type !== 'sight_capture') {
      throw new Error('no capture was requested');
    }
    sight.announce({ ...still, lookId: capture.requestId });
    sight.frame(frame('phone_screen', true));
    const result = await answer;
    expect(result.response).toMatchObject({ status: 'ok', what: 'Receipt' });
    expect(notes).toEqual([]);
    expect(tuned.at(-1)).toMatchObject({ resolution: 'medium' });
  });
});

describe('looking at a screen that is already shared', () => {
  it('answers from a fresh picture without asking again and keeps the live stream going', async () => {
    sight.settings(settings({ available: ['phone_screen'], look: [] }));
    sight.start(start('phone_screen'));
    const answer = sight.see({ source: 'phone_screen', why: 'to read it', asked: false });
    const capture = sent.find((message) => message.type === 'sight_capture');
    if (capture?.type !== 'sight_capture') {
      throw new Error('no capture was requested');
    }
    sight.announce({
      type: 'sight_still',
      callId: CALL,
      source: 'phone_screen',
      label: 'Phone screen',
      lookId: capture.requestId,
    });
    sight.frame(frame('phone_screen', true));
    expect((await answer).response).toMatchObject({ status: 'ok' });
    expect(sent.some((message) => message.type === 'sight_request')).toBe(false);
    clock += SIGHT_FRAME_LIMITS.minIntervalMs;
    sight.frame(frame('phone_screen'));
    expect(video).toHaveLength(1);
    expect(sight.row).toMatchObject({ source: 'phone_screen' });
  });
});
