import type { JsonValue, StateRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { CameraFraming, type FramedCamera } from '../src/reach/camera-framing';
import type { NewCommand } from '../src/store/repositories/commands';
import { FakeClock } from './support/fake-clock';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';

const CAMERA_ID = '1d000000-0000-4000-8000-000000000021';
const CALL = '1d000000-0000-4000-8000-000000000022';
const AT = '2026-10-10T10:00:00.000Z';

const LIVING_ROOM: FramedCamera = {
  id: CAMERA_ID,
  kind: 'camera',
  model: 'xiaomi.camera.083ae2',
  capabilities: [
    {
      key: 'raw:8.8',
      label: 'Ai Detection: Human Detection',
      access: 'read_write',
      value: { kind: 'boolean' },
    },
    {
      key: 'raw:2.11',
      label: 'Camera Control: Human Tracking',
      access: 'read_write',
      value: { kind: 'boolean' },
    },
    {
      key: 'raw:8.30',
      label: 'Ai Detection: Zoom Close-up Function Switch',
      access: 'read_write',
      value: { kind: 'boolean' },
    },
    {
      key: 'raw:2.21',
      label: 'Camera Control: Zoom Ratio',
      access: 'read_write',
      value: { kind: 'number', min: 10, max: 90, step: 1 },
    },
  ],
};

interface Bench {
  readonly framing: CameraFraming;
  readonly sent: NewCommand[];
  readonly state: Map<string, JsonValue>;
  readonly clock: FakeClock;
}

function bench(initial: Readonly<Record<string, JsonValue>>): Bench {
  const settings = new Map<string, Readonly<Record<string, unknown>>>();
  const state = new Map<string, JsonValue>(Object.entries(initial));
  const sent: NewCommand[] = [];
  const clock = new FakeClock(AT);
  const framing = new CameraFraming({
    store: {
      aiChats: {
        setting: (key): Readonly<Record<string, unknown>> | null => settings.get(key) ?? null,
        saveSetting: (key, value): void => {
          settings.set(key, value);
        },
      },
      state: {
        list: (): StateRow[] =>
          [...state].map(([capability, value]) => ({
            device_id: CAMERA_ID,
            capability,
            value,
            observed_at: AT,
          })),
      },
    },
    submit: (commands): void => {
      sent.push(...commands);
      commands.forEach((entry) => state.set(entry.capability, entry.value));
    },
    clock,
    log: testLogger('framing'),
  });
  return { framing, sent, state, clock };
}

describe('camera framing for AI conversations', () => {
  it('turns on follow people and auto zoom, zooms in a little, then restores exactly', () => {
    const { framing, sent, state } = bench({
      'raw:8.8': false,
      'raw:2.11': false,
      'raw:8.30': false,
      'raw:2.21': 10,
    });
    framing.begin(CALL, LIVING_ROOM);
    expect(sent.map((entry) => [entry.capability, entry.value])).toEqual([
      ['raw:8.8', true],
      ['raw:2.11', true],
      ['raw:8.30', true],
      ['raw:2.21', 22],
    ]);
    state.set('raw:2.21', 34);
    sent.length = 0;
    framing.restore(CALL);
    expect(sent.map((entry) => [entry.capability, entry.value])).toEqual([
      ['raw:8.8', false],
      ['raw:2.11', false],
      ['raw:8.30', false],
      ['raw:2.21', 10],
    ]);
  });

  it('never zooms out a camera that is already zoomed further in', () => {
    const { framing, sent } = bench({
      'raw:8.8': true,
      'raw:2.11': true,
      'raw:8.30': true,
      'raw:2.21': 40,
    });
    framing.begin(CALL, LIVING_ROOM);
    expect(sent).toHaveLength(0);
    framing.restore(CALL);
    framing.restore(CALL);
    expect(sent).toHaveLength(0);
  });

  it('logs what it read, set and what the camera reported back afterwards', () => {
    const logs: CapturedLogs = captureLogs();
    const { framing, clock, state } = bench({
      'raw:2.11': false,
      'raw:8.30': true,
      'raw:2.21': 10,
    });
    framing.begin(CALL, LIVING_ROOM);
    state.set('raw:2.11', false);
    clock.advanceTo('2026-10-10T10:00:04.000Z');
    const readBack = logs.records.find(
      (record) => record.event === 'reach.camera_framing_read_back',
    );
    expect(readBack?.payload).toMatchObject({ step: 'on', notApplied: 'raw:2.11=true' });
  });

  it('restores leftovers after a restart', () => {
    const { framing, sent } = bench({ 'raw:2.11': false, 'raw:8.30': true, 'raw:2.21': 10 });
    framing.begin(CALL, LIVING_ROOM);
    sent.length = 0;
    framing.restoreAll();
    expect(sent.map((entry) => [entry.capability, entry.value])).toEqual([
      ['raw:2.11', false],
      ['raw:2.21', 10],
    ]);
  });

  it('skips cameras without people tracking or auto zoom', () => {
    const { framing, sent } = bench({ power: true });
    framing.begin(CALL, { ...LIVING_ROOM, model: 'other.camera.x', capabilities: [] });
    framing.restore(CALL);
    expect(sent).toHaveLength(0);
  });
});
