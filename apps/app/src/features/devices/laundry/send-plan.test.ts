import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_ROW, type CommandRow, type JsonValue } from '@smarteverything/domain';
import { EntityStore } from '../../../store/entity-store';
import { failureText, sendPlan, type PlanRun, type PlanStep } from './send-plan';
import { washerDevice } from './washer-fixture';

const NOW = '2026-10-17T10:00:00.000Z';
const EXPIRES = '2026-10-17T10:00:30.000Z';
const DEVICE = washerDevice();

interface Sent {
  readonly capability: string;
  readonly value: JsonValue;
}

function rowFor(sent: Sent, status: CommandRow['status']): CommandRow {
  return COMMAND_ROW.parse({
    id: crypto.randomUUID(),
    device_id: DEVICE.id,
    capability: sent.capability,
    value: sent.value,
    status,
    source: 'app',
    result: null,
    error: status === 'failed' ? 'refused' : null,
    requested_by: null,
    created_at: NOW,
    started_at: NOW,
    finished_at: status === 'pending' ? null : NOW,
    expires_at: EXPIRES,
  });
}

let sequence = 0;

function harness(outcomes: Readonly<Record<string, CommandRow['status'] | 'refused'>>): {
  readonly run: PlanRun;
  readonly sent: Sent[];
} {
  const store = new EntityStore();
  const sent: Sent[] = [];
  const ledger = {
    send: (
      _device: unknown,
      capability: string,
      value: JsonValue,
    ): Promise<
      | { readonly sent: false; readonly message: string }
      | { readonly sent: true; readonly row: CommandRow }
    > => {
      const command = { capability, value };
      sent.push(command);
      const outcome = outcomes[capability] ?? 'succeeded';
      if (outcome === 'refused') {
        return Promise.resolve({ sent: false as const, message: 'no' });
      }
      const row = rowFor(command, outcome);
      sequence += 1;
      store.apply([
        {
          seq: sequence,
          type: 'change',
          table: 'commands',
          operation: 'UPDATE',
          record: row,
          oldRecord: null,
        },
      ]);
      return Promise.resolve({ sent: true as const, row });
    },
  };
  return { run: { device: DEVICE, ledger, store }, sent };
}

const STEPS: readonly PlanStep[] = [
  { capability: 'raw:2.3', value: 'Cotton', label: 'Program' },
  { capability: 'raw:2.5', value: '60', label: 'Temperature' },
  { capability: 'raw:action.2.2', value: null, label: 'Start' },
];

describe('sending a laundry plan', () => {
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

  it('sends every step in order and ends with Start', async () => {
    const { run, sent } = harness({});
    const result = await sendPlan(run, STEPS);
    expect(result).toEqual({ sent: true });
    expect(sent.map((entry) => entry.capability)).toEqual(['raw:2.3', 'raw:2.5', 'raw:action.2.2']);
  });

  it('stops at the first step the machine fails, and names it', async () => {
    const { run, sent } = harness({ 'raw:2.5': 'failed' });
    const result = await sendPlan(run, STEPS);
    expect(result).toEqual({ sent: false, failed: 'Temperature', sentBefore: 1 });
    expect(sent.map((entry) => entry.capability)).toEqual(['raw:2.3', 'raw:2.5']);
    if (!result.sent) {
      expect(failureText(result)).toBe(
        'The machine did not take “Temperature”. Nothing after it was sent.',
      );
    }
  });

  it('stops when the app refuses to send a step', async () => {
    const { run, sent } = harness({ 'raw:2.3': 'refused' });
    const result = await sendPlan(run, STEPS);
    expect(result).toMatchObject({ sent: false, failed: 'Program', sentBefore: 0 });
    expect(sent).toHaveLength(1);
  });

  it('gives up on a step that never finishes, and does not start', async () => {
    const { run, sent } = harness({ 'raw:2.3': 'pending' });
    const finished = sendPlan(run, STEPS);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await finished).toMatchObject({ sent: false, failed: 'Program' });
    expect(sent.map((entry) => entry.capability)).not.toContain('raw:action.2.2');
  });
});
