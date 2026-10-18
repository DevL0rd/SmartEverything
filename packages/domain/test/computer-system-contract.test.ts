import { describe, expect, it } from 'vitest';
import {
  AUDIO_CHANGE,
  COMPUTER_DETAIL,
  COMPUTER_FEATURE_LIST,
  COMPUTER_LIVE_NOTICE,
  COMPUTER_SCOPES,
  DEFAULT_COMPUTER_SCOPES,
  DISPLAY_CHANGE,
  DISPLAY_STATE,
  FILE_TOOL_CHANGE,
  FILE_UPLOAD_CHUNK,
  FILE_WRITE_CHANGE,
  HUB_FRAME,
  LIVE_CLIENT_MESSAGE,
  LIVE_SERVER_MESSAGE,
  NODE_FRAME,
  NODE_HELLO,
  NODE_REQUEST,
  NODE_VERB_SCOPES,
  PROCESS_QUERY,
  SYSTEM_TOOL_CHANGE,
  WATCH_MESSAGE,
  displayChangeNeedsRevert,
  processKey,
} from '../src';

const DEVICE = '00000000-0000-4000-8000-000000000001';
const AT = '2026-10-17T09:00:00.000Z';

const WINDOW = {
  sort: 'cpu',
  order: 'descending',
  tree: false,
  gpu: false,
  offset: 0,
  limit: 60,
} as const;

const SUMMARY = {
  cpuLoad: 12,
  cpuTemperature: 38,
  memoryPercent: 41,
  swapPercent: null,
  gpuLoad: 64,
  gpuTemperature: 71,
  gpuMemoryPercent: 56,
  cpuWatts: 45,
  gpuWatts: 120,
  downloadRate: 4_200_000,
  uploadRate: 120_000,
  fullestDisk: { mount: '/', percent: 63 },
  batteryLevel: null,
  charging: null,
  totalWatts: 165,
  processCount: 412,
  uptimeSeconds: 300_000,
};

const HELLO = {
  machineId: 'a'.repeat(32),
  hostname: 'workstation',
  os: { name: 'Linux', kernel: '7.2' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'CPU', threads: 32, hybrid: true },
  memoryBytes: 32e9,
  interfaces: [],
  bootedAt: AT,
};

describe('computer frames', () => {
  it('carry only changed parts in a sample and state frame', () => {
    const sample = { type: 'sample', at: AT, seq: 4, parts: { summary: SUMMARY } };
    expect(NODE_FRAME.parse(sample)).toEqual(sample);
    expect(NODE_FRAME.parse({ ...sample, key: true }).type).toBe('sample');
    const state = {
      type: 'state',
      at: AT,
      parts: { windows: { windows: [] }, services: { services: [], timers: [] } },
    };
    expect(NODE_FRAME.parse(state)).toEqual(state);
  });

  it('reject a sample with a part it does not know or a broken part', () => {
    const base = { type: 'sample', at: AT, seq: 1 };
    expect(NODE_FRAME.safeParse({ ...base, parts: { bogus: {} } }).success).toBe(false);
    expect(
      NODE_FRAME.safeParse({ ...base, parts: { summary: { ...SUMMARY, cpuLoad: 140 } } }).success,
    ).toBe(false);
  });

  it('no longer accept the old snapshot, session or pace frames', () => {
    expect(NODE_FRAME.safeParse({ type: 'snapshot', snapshot: {} }).success).toBe(false);
    expect(NODE_FRAME.safeParse({ type: 'session', session: {} }).success).toBe(false);
    expect(HUB_FRAME.safeParse({ type: 'pace', pace: 'live' }).success).toBe(false);
  });

  it('send demand with a rate per topic and an optional process window', () => {
    const frame = {
      type: 'demand',
      demand: { topics: { summary: 1000, processes: 1000 }, processes: WINDOW },
    };
    expect(HUB_FRAME.parse(frame)).toEqual(frame);
    expect(HUB_FRAME.parse({ type: 'demand', demand: { topics: {} } }).type).toBe('demand');
    const bad = { type: 'demand', demand: { topics: { cpu: 0 } } };
    expect(HUB_FRAME.safeParse(bad).success).toBe(false);
    const unknown = { type: 'demand', demand: { topics: { fans: 1000 } } };
    expect(HUB_FRAME.safeParse(unknown).success).toBe(false);
  });

  it('say which features the computer offers and ignore ones it does not know', () => {
    expect(NODE_HELLO.parse(HELLO).features).toEqual([]);
    const features = ['audio', 'future_thing', 'displays'];
    expect(NODE_HELLO.parse({ ...HELLO, features }).features).toEqual(['audio', 'displays']);
    expect(COMPUTER_FEATURE_LIST.parse(['nope'])).toEqual([]);
    expect(NODE_HELLO.parse(HELLO).cpu.kinds).toEqual([]);
  });
});

describe('watching a computer', () => {
  it('replaces the whole demand set and accepts an empty one', () => {
    const message = { type: 'watch', demands: [{ deviceId: DEVICE, topics: ['summary', 'cpu'] }] };
    expect(LIVE_CLIENT_MESSAGE.parse(message)).toEqual(message);
    expect(WATCH_MESSAGE.parse({ type: 'watch', demands: [] }).demands).toEqual([]);
  });

  it('allows the live topic of plugins and a process window, and refuses empty or unknown topics', () => {
    const live = { type: 'watch', demands: [{ deviceId: DEVICE, topics: ['live'] }] };
    expect(WATCH_MESSAGE.safeParse(live).success).toBe(true);
    const windowed = {
      type: 'watch',
      demands: [{ deviceId: DEVICE, topics: ['processes'], processes: WINDOW }],
    };
    expect(WATCH_MESSAGE.safeParse(windowed).success).toBe(true);
    const none = { type: 'watch', demands: [{ deviceId: DEVICE, topics: [] }] };
    expect(WATCH_MESSAGE.safeParse(none).success).toBe(false);
    const odd = { type: 'watch', demands: [{ deviceId: DEVICE, topics: ['fans'] }] };
    expect(WATCH_MESSAGE.safeParse(odd).success).toBe(false);
  });

  it('delivers parts to the app as a computer_live notice', () => {
    const notice = { type: 'computer_live', deviceId: DEVICE, at: AT, parts: { summary: SUMMARY } };
    expect(COMPUTER_LIVE_NOTICE.parse(notice)).toEqual(notice);
    expect(LIVE_SERVER_MESSAGE.parse(notice).type).toBe('computer_live');
  });

  it('keeps one merged view per computer with its features', () => {
    const detail = {
      deviceId: DEVICE,
      online: true,
      at: AT,
      features: ['audio'],
      parts: { summary: SUMMARY },
      scopes: DEFAULT_COMPUTER_SCOPES,
      actions: ['sleep'],
      machineActions: [],
      permissions: [],
    };
    expect(COMPUTER_DETAIL.parse(detail).features).toEqual(['audio']);
    expect(COMPUTER_DETAIL.safeParse({ ...detail, parts: { audio: 1 } }).success).toBe(false);
  });
});

describe('sound changes', () => {
  it('take a level or mute for an output, input or app, and default to outputs', () => {
    expect(AUDIO_CHANGE.parse({ action: 'volume', level: 40 })).toEqual({
      action: 'volume',
      level: 40,
      kind: 'output',
    });
    const mute = { action: 'mute', muted: true, kind: 'input', device: 'Headset' };
    expect(AUDIO_CHANGE.parse(mute)).toEqual(mute);
    expect(
      AUDIO_CHANGE.parse({ action: 'app_output', app: 'Spotify', output: 'HDMI' }).action,
    ).toBe('app_output');
  });

  it('refuse levels outside 0 to 150, a default without a device and unknown actions', () => {
    expect(AUDIO_CHANGE.safeParse({ action: 'volume', level: 151 }).success).toBe(false);
    expect(AUDIO_CHANGE.safeParse({ action: 'volume', level: -1 }).success).toBe(false);
    expect(AUDIO_CHANGE.safeParse({ action: 'default', kind: 'output' }).success).toBe(false);
    expect(AUDIO_CHANGE.safeParse({ action: 'mic_mute', muted: true }).success).toBe(false);
  });
});

describe('screen changes', () => {
  it('ask for the keep-or-revert timer only for changes that can blank a screen', () => {
    const risky = [
      { action: 'disable', output: 'DP-1' },
      { action: 'mode', output: 'DP-1', width: 2560, height: 1440 },
      { action: 'scale', output: 'DP-1', percent: 125 },
      { action: 'rotation', output: 'DP-1', degrees: 90 },
      { action: 'position', output: 'DP-1', relativeTo: 'DP-2', side: 'left' },
    ] as const;
    for (const change of risky) {
      expect(displayChangeNeedsRevert(DISPLAY_CHANGE.parse(change))).toBe(true);
    }
    const safe = [
      { action: 'brightness', level: 50 },
      { action: 'hdr', output: 'DP-1', enabled: true },
      { action: 'night_light', mode: 'on', temperatureKelvin: 4500 },
    ] as const;
    for (const change of safe) {
      expect(displayChangeNeedsRevert(DISPLAY_CHANGE.parse(change))).toBe(false);
    }
  });

  it('refuse angles that are not quarter turns and temperatures out of range', () => {
    expect(DISPLAY_CHANGE.safeParse({ action: 'rotation', output: 'a', degrees: 45 }).success).toBe(
      false,
    );
    expect(
      DISPLAY_CHANGE.safeParse({ action: 'night_light', mode: 'on', temperatureKelvin: 100 })
        .success,
    ).toBe(false);
    expect(DISPLAY_CHANGE.safeParse({ action: 'keep' }).success).toBe(false);
  });

  it('describe a pending revert in the state', () => {
    const state = {
      outputs: [],
      nightLight: { supported: true, mode: 'off', active: false, temperatureKelvin: null },
      pendingRevert: { token: 't1', startedAt: AT, revertsAt: AT, summary: 'Resolution of DP-1' },
    };
    expect(DISPLAY_STATE.parse(state).pendingRevert?.token).toBe('t1');
  });
});

describe('system, files and process requests', () => {
  it('route startup apps and services through the same tool change as other settings', () => {
    const actions = ['power_mode', 'dnd', 'wifi', 'startup_app', 'service'];
    const found = SYSTEM_TOOL_CHANGE.options.map((option) => option.shape.action.value);
    for (const action of actions) {
      expect(found).toContain(action);
    }
    const unit = { action: 'service', unit: 'backup.service', operation: 'restart' };
    expect(SYSTEM_TOOL_CHANGE.parse(unit)).toEqual(unit);
    expect(SYSTEM_TOOL_CHANGE.safeParse({ ...unit, operation: 'delete' }).success).toBe(false);
  });

  it('make files safe by default: trash not delete, no overwrite, chunked uploads', () => {
    const move = FILE_WRITE_CHANGE.parse({ action: 'move', paths: ['/a'], to: '/b' });
    expect(move).toMatchObject({ replace: false });
    expect(FILE_WRITE_CHANGE.safeParse({ action: 'delete', paths: ['/a'] }).success).toBe(false);
    expect(FILE_WRITE_CHANGE.safeParse({ action: 'rename', path: '/a', name: 'x/y' }).success).toBe(
      false,
    );
    expect(FILE_WRITE_CHANGE.safeParse({ action: 'trash', paths: [] }).success).toBe(false);
    const upload = { action: 'upload', attachmentId: 'att', path: '/home/u/a.txt' };
    expect(FILE_TOOL_CHANGE.parse(upload)).toMatchObject({ replace: false });
    const chunk = { path: '/tmp/a', start: 0, data: 'aGk=', final: true };
    expect(FILE_UPLOAD_CHUNK.parse(chunk)).toMatchObject({ replace: false });
    expect(FILE_UPLOAD_CHUNK.safeParse({ ...chunk, data: 'not base64!' }).success).toBe(false);
  });

  it('wrap every new node verb and map it to the scope that guards it', () => {
    const verbs = [
      { verb: 'audio' },
      { verb: 'audio_set', change: { action: 'mute', muted: true, kind: 'output' } },
      { verb: 'display_set', change: { action: 'enable', output: 'DP-1' }, revert: true },
      { verb: 'display_confirm', token: 't', keep: true },
      { verb: 'system_set', change: { action: 'dnd', enabled: true } },
      { verb: 'window_set', change: { windowId: 'w1', action: 'focus' } },
      { verb: 'startup_set', change: { action: 'startup_app', id: 'x', enabled: false } },
      { verb: 'service_set', change: { action: 'service', unit: 'u', operation: 'stop' } },
      { verb: 'process_detail', pid: 1 },
      { verb: 'priority', pid: 1, nice: 10 },
      { verb: 'files_search', query: { path: '/', text: 'a', cursor: null } },
      { verb: 'file_write', change: { action: 'new_folder', path: '/tmp/a' } },
    ];
    for (const request of verbs) {
      const parsed = NODE_REQUEST.parse(request);
      expect(NODE_VERB_SCOPES[parsed.verb]).not.toBeUndefined();
    }
    expect(NODE_VERB_SCOPES.audio_set).toBe('system');
    expect(NODE_VERB_SCOPES.priority).toBe('processes');
    expect(NODE_VERB_SCOPES.file_write).toBe('files');
    expect(NODE_REQUEST.safeParse({ verb: 'priority', pid: 1, nice: 20 }).success).toBe(false);
  });

  it('add the system scope, on by default', () => {
    expect(DEFAULT_COMPUTER_SCOPES.system).toBe(true);
    expect(
      COMPUTER_SCOPES.safeParse({ ...DEFAULT_COMPUTER_SCOPES, system: undefined }).success,
    ).toBe(false);
  });

  it('sort programs by any column and key rows by pid and start time', () => {
    expect(PROCESS_QUERY.parse({ sort: 'gpu', order: 'ascending', tree: 'true' })).toMatchObject({
      sort: 'gpu',
      tree: true,
    });
    expect(PROCESS_QUERY.parse({ tree: 'false' }).tree).toBe(false);
    expect(processKey({ pid: 7, start: 99 })).toBe('7:99');
  });
});
