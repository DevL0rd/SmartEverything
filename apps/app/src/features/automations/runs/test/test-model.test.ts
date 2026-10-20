import { describe, expect, it } from 'vitest';
import {
  RUN_NODE_RECORD,
  type AutomationRunWouldSend,
  type OutputPort,
  type RunNodeRecord,
} from '@smarteverything/domain';
import {
  debugActionForKey,
  debugControls,
  initialPayload,
  initialStartWith,
  missingFields,
  overridesOf,
  pauseOf,
  payloadFieldsOf,
  realRequest,
  startWithOptions,
  testRequest,
  treeRows,
  variableSections,
  wouldSendRows,
  type PretendRow,
  type TestDraft,
} from './test-model';

const PORTS: readonly OutputPort[] = [
  { name: 'level', type: { t: 'number', integer: true, min: 0, max: 100 } },
  { name: 'room_name', type: { t: 'text' }, optional: true },
];

const DEVICE_ROW: PretendRow = {
  id: 'a',
  kind: 'device',
  device: 'lamp',
  control: 'power',
  value: true,
};
const VARIABLE_ROW: PretendRow = {
  id: 'b',
  kind: 'variable',
  automationId: 'auto',
  name: 'away',
  value: false,
};

const LAST = { label: 'Kitchen switch pressed at 14:05', values: { level: 40 } };

function draft(overrides: Partial<TestDraft>): TestDraft {
  return { startWith: 'form', last: LAST, values: { level: 10 }, rows: [], ...overrides };
}

describe('payload form', () => {
  it('builds fields from trigger outputs and marks optional ones', () => {
    const fields = payloadFieldsOf(PORTS);
    expect(fields.map((field) => [field.name, field.label, field.required])).toEqual([
      ['level', 'Level', true],
      ['room_name', 'Room name', false],
    ]);
    expect(initialPayload(fields)).toEqual({ level: 0, room_name: '' });
  });

  it('lists required fields that have no value', () => {
    const fields = payloadFieldsOf(PORTS);
    expect(missingFields(fields, { room_name: 'x' })).toEqual(['Level']);
    expect(missingFields(fields, { level: 1 })).toEqual([]);
  });
});

describe('start with', () => {
  it('prefers the last real event and disables it when there is none', () => {
    expect(initialStartWith(LAST)).toBe('last');
    expect(initialStartWith(null)).toBe('form');
    expect(startWithOptions(null)[0]?.disabled).toBe(true);
    expect(startWithOptions(LAST)[0]).toMatchObject({ disabled: false, subtitle: LAST.label });
  });
});

describe('start requests', () => {
  it('sends a dry run with the typed values, pretend rows and breakpoints', () => {
    const request = testRequest('auto', draft({ rows: [DEVICE_ROW, VARIABLE_ROW] }), ['n1', 'n2']);
    expect(request).toEqual({
      automationId: 'auto',
      mode: 'dry',
      inputs: { level: 10 },
      overrides: {
        devices: [{ device: 'lamp', control: 'power', value: true }],
        variables: [{ automationId: 'auto', name: 'away', value: false }],
      },
      breakpoints: ['n1', 'n2'],
    });
  });

  it('uses the last real event when chosen and leaves overrides out when none are set', () => {
    const request = testRequest('auto', draft({ startWith: 'last' }), []);
    expect(request.inputs).toEqual({ level: 40 });
    expect('overrides' in request).toBe(false);
  });

  it('ignores pretend rows that are not filled in', () => {
    expect(overridesOf([{ ...DEVICE_ROW, device: ' ' }])).toBeUndefined();
  });

  it('runs for real without overrides or breakpoints', () => {
    const request = realRequest('auto', draft({ rows: [DEVICE_ROW] }));
    expect(request).toEqual({ automationId: 'auto', mode: 'live', inputs: { level: 10 } });
  });
});

describe('would have sent', () => {
  const command: AutomationRunWouldSend = {
    at: '2026-10-19T10:00:00.000Z',
    runId: 'r',
    path: 'a/b',
    node: 'n1',
    kind: 'device.set',
    key: '',
    targets: ['Kitchen lamp'],
    params: { brightness: 75 },
    outcome: 'ok',
  };

  it('names the step, target and value in plain words', () => {
    const rows = wouldSendRows(
      [command, { ...command, targets: [], params: {}, outcome: 'offline' }],
      new Map([['n1', 'Set light']]),
    );
    expect(rows[0]).toMatchObject({
      title: 'Set light',
      target: 'Kitchen lamp',
      value: 'Brightness 75',
      outcome: 'Would work',
      problem: false,
    });
    expect(rows[1]).toMatchObject({ target: 'No target', value: 'No value', problem: true });
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });
});

describe('debug controls', () => {
  it('enables stepping only while paused and Step into only on Custom Nodes', () => {
    const enabled = (paused: boolean, onInstance: boolean): string[] =>
      debugControls({ paused, onInstance, busy: false })
        .filter((control) => control.enabled)
        .map((control) => control.action);
    expect(enabled(false, false)).toEqual(['stop']);
    expect(enabled(true, false)).toEqual(['continue', 'over', 'out', 'stop']);
    expect(enabled(true, true)).toEqual(['continue', 'over', 'into', 'out', 'stop']);
  });

  it('disables everything while a step is being sent', () => {
    const all = debugControls({ paused: true, onInstance: true, busy: true });
    expect(all.every((control) => !control.enabled)).toBe(true);
  });

  it('maps the function keys and respects what is enabled', () => {
    const state = { paused: true, onInstance: true, busy: false };
    expect(debugActionForKey('F8', false, state)).toBe('continue');
    expect(debugActionForKey('F10', false, state)).toBe('over');
    expect(debugActionForKey('F11', false, state)).toBe('into');
    expect(debugActionForKey('F11', true, state)).toBe('out');
    expect(debugActionForKey('F11', false, { ...state, onInstance: false })).toBeNull();
    expect(debugActionForKey('a', false, state)).toBeNull();
  });

  it('names the paused node', () => {
    expect(pauseOf([], new Map())).toBeNull();
    expect(pauseOf([{ nodeId: 'n1' }], new Map([['n1', 'Set light']]))).toEqual({
      nodeId: 'n1',
      title: 'Set light',
    });
  });
});

const N1 = '11111111-1111-4111-8111-111111111111';
const N2 = '22222222-2222-4222-8222-222222222222';

describe('variables', () => {
  const record = (nodeId: string, input: object | null, output: object | null): RunNodeRecord =>
    RUN_NODE_RECORD.parse({
      run_id: '0b0f6f0e-6f3c-4c3e-9d2a-5f1b6a1b2c3d',
      seq: 0,
      path: nodeId,
      node_id: nodeId,
      iteration: 0,
      status: 'succeeded',
      started_at: '2026-10-19T10:00:00.000Z',
      finished_at: '2026-10-19T10:00:01.000Z',
      duration_ms: 1,
      input_preview: input,
      output_preview: output,
      truncated: false,
      error: null,
      command_ids: [],
      late: false,
    });

  it('collects the step inputs, values so far, remembered values and trigger payload', () => {
    const sections = variableSections({
      nodes: [record(N1, null, { level: 5 }), record(N2, { level: 5 }, null)],
      paused: N2,
      titles: new Map([[N1, 'Read level']]),
      trigger: { level: 40 },
      rows: [VARIABLE_ROW, DEVICE_ROW],
    });
    expect(sections.map((section) => [section.id, section.value])).toEqual([
      ['step', { level: 5 }],
      ['run', { 'Read level': { level: 5 } }],
      ['persistent', { away: false }],
      ['trigger', { level: 40 }],
    ]);
  });

  it('shows a tree that opens one level at a time', () => {
    const value = { room: { lamps: ['a', 'b'] }, on: true };
    expect(treeRows(value, new Set())).toEqual([
      { key: '/room', depth: 0, name: 'room', preview: '1 fields', open: false },
      { key: '/on', depth: 0, name: 'on', preview: 'on', open: null },
    ]);
    const opened = treeRows(value, new Set(['/room', '/room/lamps']));
    expect(opened.map((row) => [row.depth, row.name, row.preview])).toEqual([
      [0, 'room', '1 fields'],
      [1, 'lamps', '2 items'],
      [2, '1', 'a'],
      [2, '2', 'b'],
      [0, 'on', 'on'],
    ]);
  });
});
