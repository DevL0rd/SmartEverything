import { AUTOMATION_RUN_ID } from '@smarteverything/domain';
import type { RunNodeRecord } from '@smarteverything/domain';
import type { ReadPort, ReadRequest } from '@smarteverything/flow/interpret/frames';
import { describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../../src/clock/simulated';
import {
  ReadCapture,
  instantsOf,
  replayReads,
  replaySeed,
  statesAt,
} from '../../../src/automations/sim/replay';
import { AUTOMATION_LEVEL } from '@smarteverything/flow/interpret/kept';

const RUN = AUTOMATION_RUN_ID.parse('00000000-0000-4000-8000-000000000001');

let seq = 0;

function node(
  fields: Partial<RunNodeRecord> & Pick<RunNodeRecord, 'node_id' | 'path'>,
): RunNodeRecord {
  seq += 1;
  return {
    run_id: RUN,
    seq,
    iteration: 0,
    status: 'succeeded',
    started_at: null,
    finished_at: null,
    duration_ms: null,
    input_preview: null,
    output_preview: null,
    truncated: false,
    error: null,
    command_ids: [],
    late: false,
    ...fields,
  };
}

function readRequest(id: string): ReadRequest {
  return {
    kind: 'device.get',
    node: { id, key: id },
    inputs: {},
    seed: 1,
    activation: 'root:0',
    ...AUTOMATION_LEVEL,
  };
}

const live: ReadPort = {
  node: () => ({ ok: true, value: { value: 'live' } }),
  variable: () => ({ ok: true, value: 0 }),
};

describe('replaySeed', () => {
  it('takes the trigger and inputs the run started with', () => {
    const trigger = {
      source: 'sensor',
      kind: 'occupancy',
      subject: null,
      field: null,
      value: true,
      previous: null,
      at: '2026-10-18T12:00:00.000Z',
      profileId: null,
      data: {},
    };
    const seed = replaySeed({
      record: { trigger, state: { inputs: { level: 3 } } },
      nodes: [],
    });
    expect(seed.trigger).toEqual(trigger);
    expect(seed.inputs).toEqual({ level: 3 });
  });

  it('starts empty for a run that kept neither', () => {
    const seed = replaySeed({ record: { trigger: null, state: null }, nodes: [] });
    expect(seed).toMatchObject({ trigger: null, inputs: {}, truncated: [] });
  });

  it('lists the nodes whose capture was cut short', () => {
    const seed = replaySeed({
      record: { trigger: null, state: null },
      nodes: [node({ node_id: 'a', path: 'root/0', truncated: true, output_preview: { v: 1 } })],
    });
    expect(seed.truncated).toEqual(['a']);
  });
});

describe('replayReads', () => {
  it('answers each pass of a node with its stored output, in order', () => {
    const nodes = [
      node({ node_id: 'a', path: 'root/0', output_preview: { value: 1 } }),
      node({ node_id: 'a', path: 'root/0', iteration: 1, output_preview: { value: 2 } }),
    ];
    const { port, flagged } = replayReads(live, new ReadCapture(nodes));
    expect(port.node(readRequest('a'))).toEqual({ ok: true, value: { value: 1 } });
    expect(port.node(readRequest('a'))).toEqual({ ok: true, value: { value: 2 } });
    expect(flagged).toEqual([]);
  });

  it('replays a stored failure', () => {
    const failed = node({
      node_id: 'a',
      path: 'root/0',
      status: 'failed',
      error: {
        class: 'Timeout',
        message: 'slow',
        node: '00000000-0000-4000-8000-0000000000aa',
        path: 'root/0',
        attempt: 1,
        at: '2026-10-18T12:00:00.000Z',
      },
    });
    const { port } = replayReads(live, new ReadCapture([failed]));
    expect(port.node(readRequest('a'))).toMatchObject({ ok: false, class: 'Timeout' });
  });

  it('falls back to the scenario world once and flags the node when the capture is gone', () => {
    const cut = node({ node_id: 'a', path: 'root/0', truncated: true, output_preview: { v: 1 } });
    const { port, flagged } = replayReads(live, new ReadCapture([cut]));
    expect(port.node(readRequest('a'))).toEqual({ ok: true, value: { value: 'live' } });
    port.node(readRequest('a'));
    expect(flagged).toEqual(['a']);
  });
});

describe('playback of stored records', () => {
  const nodes = [
    node({
      node_id: 'a',
      path: 'root/0',
      started_at: '2026-10-18T12:00:00.000Z',
      finished_at: '2026-10-18T12:00:01.000Z',
    }),
    node({
      node_id: 'b',
      path: 'root/1',
      status: 'failed',
      started_at: '2026-10-18T12:00:01.000Z',
      finished_at: '2026-10-18T12:00:05.000Z',
    }),
  ];

  it('lists the distinct moments in order', () => {
    expect(instantsOf(nodes)).toEqual([
      '2026-10-18T12:00:00.000Z',
      '2026-10-18T12:00:01.000Z',
      '2026-10-18T12:00:05.000Z',
    ]);
  });

  it('shows what was done and what was still running at a moment', () => {
    const states = statesAt(nodes, '2026-10-18T12:00:03.000Z');
    expect(states.get('root/0')?.status).toBe('succeeded');
    expect(states.get('root/1')?.status).toBe('running');
    expect(statesAt(nodes, '2026-10-18T11:59:59.000Z').size).toBe(0);
    expect(statesAt(nodes, '2026-10-18T12:00:05.000Z').get('root/1')?.status).toBe('failed');
  });
});

describe('SimulatedClock', () => {
  it('reports the earliest live timer and forgets cancelled ones', () => {
    const clock = new SimulatedClock('2026-10-18T12:00:00.000Z');
    expect(clock.nextDue()).toBeUndefined();
    const cancel = clock.at(new Date('2026-10-18T12:05:00.000Z'), () => undefined);
    clock.at(new Date('2026-10-18T12:10:00.000Z'), () => undefined);
    expect(clock.nextDue()).toBe(Date.parse('2026-10-18T12:05:00.000Z'));
    cancel();
    expect(clock.nextDue()).toBe(Date.parse('2026-10-18T12:10:00.000Z'));
  });
});
