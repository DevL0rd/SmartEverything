import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMAND_ROW,
  DEVICE_ROW,
  MICROWAVE_KEYS,
  type CommandRow,
  type JsonValue,
  type MicrowaveMode,
  type MicrowaveProgram,
} from '@smarteverything/domain';
import { EntityStore } from '../../../store/entity-store';
import { deviceOf } from '../../../store/state';
import { programPlan, runProgram, type ProgramRun } from './send-program';

const NOW = '2026-10-17T10:00:00.000Z';
const EXPIRES = '2026-10-17T10:00:30.000Z';
const DEVICE_ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const MODE: MicrowaveMode = {
  mode: 'Convection',
  supportedOperations: ['start', 'set'],
  supportedOptions: {
    operationTime: {
      min: '00:01:00',
      max: '05:00:00',
      default: '00:01:00',
      resolution: '00:01:00',
    },
    temperature: { C: { min: 100, max: 230, default: 160, resolution: 10 } },
  },
};
const PROGRAM: MicrowaveProgram = {
  mode: 'Convection',
  duration: '00:10:00',
  power: '',
  temperature: 180,
};
const DEVICE = deviceOf(
  DEVICE_ROW.parse({
    id: DEVICE_ID,
    provider: 'smartthings',
    external_id: 'oven-1',
    parent_id: null,
    kind: 'sensor',
    name: 'Microwave',
    display_name: null,
    model: 'oven',
    manufacturer: 'Samsung',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: NOW,
    updated_at: NOW,
  }),
);

interface Sent {
  readonly capability: string;
  readonly value: JsonValue;
}
interface SendOutcome {
  readonly sent: true;
  readonly row: CommandRow;
}
type Reports = (sent: Sent) => readonly { readonly key: string; readonly value: JsonValue }[];

function commandRow(sent: Sent, failed: boolean): CommandRow {
  return COMMAND_ROW.parse({
    id: crypto.randomUUID(),
    device_id: DEVICE_ID,
    capability: sent.capability,
    value: sent.value,
    status: failed ? 'failed' : 'succeeded',
    source: 'app',
    result: null,
    error: failed ? 'refused' : null,
    requested_by: null,
    created_at: NOW,
    started_at: NOW,
    finished_at: NOW,
    expires_at: EXPIRES,
  });
}

let sequence = 0;

function next(): number {
  sequence += 1;
  return sequence;
}
function harness(
  reports: Reports,
  failing: ReadonlySet<string> = new Set(),
): { readonly run: ProgramRun; readonly sent: Sent[] } {
  const store = new EntityStore();
  const sent: Sent[] = [];
  const ledger = {
    send: (_device: unknown, capability: string, value: JsonValue): Promise<SendOutcome> => {
      const command = { capability, value };
      sent.push(command);
      const row = commandRow(command, failing.has(capability));
      store.apply([
        {
          seq: next(),
          type: 'change',
          table: 'commands',
          operation: 'UPDATE',
          record: row,
          oldRecord: null,
        },
      ]);
      for (const report of reports(command)) {
        setTimeout(() => {
          store.apply([
            {
              seq: next(),
              type: 'change',
              table: 'device_state',
              operation: 'UPDATE',
              record: {
                device_id: DEVICE_ID,
                capability: report.key,
                value: report.value,
                observed_at: NOW,
              },
              oldRecord: null,
            },
          ]);
        }, 1000);
      }
      return Promise.resolve({ sent: true, row });
    },
  };
  return { run: { device: DEVICE, ledger, store }, sent };
}

const REPORT_ALL: Reports = (sent) => {
  if (sent.capability === MICROWAVE_KEYS.mode) {
    return [{ key: MICROWAVE_KEYS.mode, value: sent.value }];
  }
  if (sent.capability === MICROWAVE_KEYS.setDuration) {
    return [{ key: MICROWAVE_KEYS.duration, value: PROGRAM.duration }];
  }
  if (sent.capability === MICROWAVE_KEYS.temperature) {
    return [{ key: MICROWAVE_KEYS.temperature, value: sent.value }];
  }
  return [];
};
const CHANGE = programPlan({
  program: PROGRAM,
  mode: MODE,
  unit: 'C',
  applied: 'MicroWave',
  start: true,
});

describe('microwave program plan', () => {
  it('sets the mode first only when it differs from the reported mode', () => {
    expect(CHANGE.mode?.capability).toBe(MICROWAVE_KEYS.mode);
    expect(
      programPlan({ program: PROGRAM, mode: MODE, unit: 'C', applied: 'Convection', start: true })
        .mode,
    ).toBeNull();
  });

  it('plans one step per setting the mode supports', () => {
    expect(CHANGE.settings.map((step) => step.capability)).toEqual([
      MICROWAVE_KEYS.setDuration,
      MICROWAVE_KEYS.temperature,
    ]);
  });

  it('plans no settings for a mode that cannot be set remotely', () => {
    const fixed = { ...MODE, supportedOperations: ['start'] };
    expect(
      programPlan({ program: PROGRAM, mode: fixed, unit: 'C', applied: 'Convection', start: true })
        .settings,
    ).toEqual([]);
  });
});

describe('running a microwave program', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
    vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
      callback();
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts only after the mode and every setting are reported back', async () => {
    const { run, sent } = harness(REPORT_ALL);
    const finished = runProgram(run, CHANGE);
    await vi.advanceTimersByTimeAsync(500);
    expect(sent.map((entry) => entry.capability)).toEqual([MICROWAVE_KEYS.mode]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.map((entry) => entry.capability)).toEqual([
      MICROWAVE_KEYS.mode,
      MICROWAVE_KEYS.setDuration,
      MICROWAVE_KEYS.temperature,
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await finished).toBe(true);
    expect(sent.at(-1)).toEqual({ capability: MICROWAVE_KEYS.start, value: null });
  });

  it('saves without starting when asked not to start', async () => {
    const { run, sent } = harness(REPORT_ALL);
    const finished = runProgram(run, { ...CHANGE, start: false });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await finished).toBe(true);
    expect(sent.map((entry) => entry.capability)).not.toContain(MICROWAVE_KEYS.start);
  });

  it('stops without starting when a command is refused', async () => {
    const { run, sent } = harness(REPORT_ALL, new Set([MICROWAVE_KEYS.setDuration]));
    const finished = runProgram(run, CHANGE);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await finished).toBe(false);
    expect(sent.map((entry) => entry.capability)).toEqual([
      MICROWAVE_KEYS.mode,
      MICROWAVE_KEYS.setDuration,
    ]);
  });

  it('does not start when the microwave never reports the settings', async () => {
    const { run, sent } = harness((entry) =>
      entry.capability === MICROWAVE_KEYS.mode ? REPORT_ALL(entry) : [],
    );
    const finished = runProgram(run, CHANGE);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await finished).toBe(false);
    expect(sent.map((entry) => entry.capability)).not.toContain(MICROWAVE_KEYS.start);
  });
});
