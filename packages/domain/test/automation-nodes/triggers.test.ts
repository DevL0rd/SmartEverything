import { describe, expect, it } from 'vitest';
import {
  CAMERA_DETECTION_VARIANTS,
  DEVICE_MATCHER_MAPPINGS,
  TRIGGER_KINDS,
  TRIGGER_KIND_IDS,
  TRIGGER_V11_KINDS,
  buildRegistry,
  compileTriggerMatcher,
  nodeCatalogue,
  type NodeKind,
} from '../../src/index';

const LAMP = '11111111-1111-4111-8111-111111111111';
const registry = buildRegistry([...TRIGGER_KINDS, ...TRIGGER_V11_KINDS]);

function kind(id: string): NodeKind {
  const found = registry.get(id);
  if (found === undefined) throw new Error(`missing ${id}`);
  return found;
}

function inputNames(id: string): readonly string[] {
  return kind(id).inputs.map((port) => port.name);
}

function outputNames(id: string): readonly string[] {
  return kind(id).outputs.map((port) => port.name);
}

const TIMING = ['test', 'window', 'hold', 'debounce', 'cooldown', 'silentFor', 'first', 'rearm'];

describe('trigger kinds', () => {
  it('lists the thirteen v1 kinds and no manual trigger', () => {
    expect([...TRIGGER_KIND_IDS].sort()).toEqual(
      [
        'trigger.called',
        'trigger.camera',
        'trigger.button',
        'trigger.device',
        'trigger.device_health',
        'trigger.interval',
        'trigger.presence',
        'trigger.run_status',
        'trigger.signal',
        'trigger.speech',
        'trigger.sun',
        'trigger.time',
        'trigger.value',
      ].sort(),
    );
    expect(registry.has('trigger.manual')).toBe(false);
  });

  it('are all shipped member triggers in the triggers category without exits', () => {
    for (const each of TRIGGER_KINDS) {
      expect(each.class).toBe('trigger');
      expect(each.category).toBe('triggers');
      expect(each.tier).toBe('v1');
      expect(each.access).toBe('member');
      expect(each.exits).toEqual([]);
    }
    expect(registry.shipped()).toHaveLength(TRIGGER_KINDS.length + TRIGGER_V11_KINDS.length);
  });

  it('takes only static options except the watched condition, and no filter', () => {
    for (const each of [...TRIGGER_KINDS, ...TRIGGER_V11_KINDS]) {
      expect(each.inputs.some((port) => port.name === 'filter')).toBe(false);
      for (const port of each.inputs.filter((one) => one.name !== 'condition')) {
        expect(port.static).toBe(true);
      }
    }
  });

  it('shows up in the catalogue', () => {
    const entries = nodeCatalogue(registry, { group: 'triggers' });
    expect(entries).toHaveLength(TRIGGER_KINDS.length + TRIGGER_V11_KINDS.length);
    expect(nodeCatalogue(registry, { query: 'baby' }).map((entry) => entry.id)).toEqual([
      'trigger.camera',
    ]);
  });
});

describe('signal-backed kinds', () => {
  it.each([
    ['trigger.device', true],
    ['trigger.signal', true],
    ['trigger.value', true],
    ['trigger.presence', false],
    ['trigger.camera', false],
  ])('%s carries the timing block (ignoreOwnChanges %s)', (id, ignoresOwn) => {
    for (const name of TIMING) expect(inputNames(id)).toContain(name);
    expect(inputNames(id).includes('ignoreOwnChanges')).toBe(ignoresOwn);
  });

  it('ignoreOwnChanges defaults to true', () => {
    const port = kind('trigger.device').inputs.find((one) => one.name === 'ignoreOwnChanges');
    expect(port?.default).toBe(true);
  });

  it('the health trigger takes only a hold from the timing block', () => {
    const names = inputNames('trigger.device_health');
    expect(names).toContain('hold');
    for (const name of TIMING.filter((one) => one !== 'hold')) expect(names).not.toContain(name);
  });

  it('time, interval, sun and speech have no timing block', () => {
    for (const id of ['trigger.time', 'trigger.interval', 'trigger.sun', 'trigger.speech']) {
      for (const name of TIMING) expect(inputNames(id)).not.toContain(name);
    }
  });
});

describe('typed outputs', () => {
  it('device changed', () => {
    expect(outputNames('trigger.device')).toEqual([
      'device',
      'control',
      'value',
      'previous',
      'at',
      'cause',
      'room',
    ]);
    const previous = kind('trigger.device').outputs.find((port) => port.name === 'previous');
    expect(previous?.optional).toBe(true);
  });

  it('the clock kinds output when they ran and when they were due', () => {
    expect(outputNames('trigger.time')).toEqual(['at', 'scheduledFor']);
    expect(outputNames('trigger.sun')).toEqual(['at', 'scheduledFor', 'event']);
    expect(outputNames('trigger.interval')).toEqual(['at', 'tick']);
  });

  it('the others', () => {
    expect(outputNames('trigger.signal')).toContain('data');
    expect(outputNames('trigger.speech')).toEqual(['phrase', 'text', 'speaker', 'source', 'at']);
    expect(outputNames('trigger.presence')).toEqual(['person', 'place', 'event', 'at']);
    expect(outputNames('trigger.camera')).toEqual([
      'camera',
      'detection',
      'confidence',
      'at',
      'snapshot',
    ]);
    expect(outputNames('trigger.button')).toEqual(['device', 'press', 'at']);
    expect(outputNames('trigger.value')).toEqual(['value', 'previous', 'at']);
    expect(outputNames('trigger.run_status')).toEqual([
      'automation',
      'runId',
      'status',
      'error',
      'at',
    ]);
    expect(outputNames('trigger.device_health')).toEqual(['device', 'event', 'battery', 'at']);
    expect(outputNames('trigger.called')).toEqual([]);
  });

  it('the interval has a one minute minimum', () => {
    const every = kind('trigger.interval').inputs.find((port) => port.name === 'every');
    expect(every?.ui?.min).toBe(60_000);
    expect(every?.required).toBe(true);
  });

  it('the sun offset is limited to twelve hours', () => {
    const offset = kind('trigger.sun').inputs.find((port) => port.name === 'offset');
    expect(offset?.ui?.min).toBe(-43_200_000);
    expect(offset?.ui?.max).toBe(43_200_000);
  });
});

describe('compile to matcher', () => {
  it('maps exactly the signal-backed kinds', () => {
    expect(Object.keys(DEVICE_MATCHER_MAPPINGS).sort()).toEqual(
      [
        'trigger.device',
        'trigger.signal',
        'trigger.presence',
        'trigger.camera',
        'trigger.button',
        'trigger.value',
        'trigger.run_status',
        'trigger.device_health',
        'trigger.computer',
        'trigger.phone',
        'trigger.health',
        'trigger.chat',
        'trigger.event',
        'trigger.timer',
        'trigger.webhook',
        'trigger.hub_started',
        'trigger.weather',
      ].sort(),
    );
    for (const id of Object.keys(DEVICE_MATCHER_MAPPINGS)) expect(registry.has(id)).toBe(true);
  });

  it('every mapped port exists on its kind', () => {
    for (const [id, mapping] of Object.entries(DEVICE_MATCHER_MAPPINGS)) {
      const names = inputNames(id);
      const ports = [
        mapping.variantPort,
        mapping.sourcePort,
        mapping.kindPort,
        mapping.subjectPort,
        mapping.fieldPort,
        mapping.matchRecordPort,
        ...Object.keys(mapping.matchPorts),
        ...(mapping.requireOneOf ?? []),
        ...mapping.runtimePorts,
      ];
      for (const port of ports)
        if (port !== null && port !== undefined) expect(names).toContain(port);
    }
  });

  it('a device change by hand in a room', () => {
    const result = compileTriggerMatcher('trigger.device', {
      room: 'kitchen',
      control: 'power',
      cause: 'physical',
      family: 'light',
      cooldown: 30_000,
    });
    expect(result).toEqual({
      ok: true,
      matcher: {
        source: 'device',
        kind: 'state',
        field: 'power',
        match: { roomId: 'kitchen', family: 'light', cause: 'physical' },
        cooldownSeconds: 30,
      },
    });
  });

  it('a device trigger needs a device, room, family or role', () => {
    const result = compileTriggerMatcher('trigger.device', { control: 'power' });
    expect(result.ok).toBe(false);
  });

  it('a single device with a test and a hold', () => {
    const result = compileTriggerMatcher('trigger.device', {
      device: LAMP,
      control: 'temperature',
      test: { is: 'gt', to: 26 },
      hold: 300_000,
      rearm: 24,
      first: 'day',
    });
    expect(result).toMatchObject({
      ok: true,
      matcher: {
        subject: LAMP,
        field: 'temperature',
        test: { is: 'gt', to: 26 },
        holdSeconds: 300,
        rearm: 24,
        first: 'day',
      },
    });
  });

  it('the generic signal merges its match record', () => {
    const result = compileTriggerMatcher('trigger.signal', {
      source: 'provider',
      kind: 'status',
      match: { state: 'down' },
      silentFor: 120_000,
    });
    expect(result).toEqual({
      ok: true,
      matcher: {
        source: 'provider',
        kind: 'status',
        match: { state: 'down' },
        silentSeconds: 120,
      },
    });
    expect(compileTriggerMatcher('trigger.signal', { kind: 'status' }).ok).toBe(false);
  });

  it('refuses options that clash in the timing block', () => {
    const clash = compileTriggerMatcher('trigger.signal', {
      source: 'device',
      kind: 'state',
      silentFor: 60_000,
      hold: 1000,
    });
    expect(clash).toEqual({
      ok: false,
      error: 'A silence trigger takes only silentSeconds and cooldownSeconds',
    });
  });

  it('presence follows the event choice', () => {
    expect(compileTriggerMatcher('trigger.presence', {})).toEqual({
      ok: true,
      matcher: { source: 'plugin_router', kind: 'person_arrived' },
    });
    expect(compileTriggerMatcher('trigger.presence', { event: 'left', person: LAMP })).toEqual({
      ok: true,
      matcher: { source: 'plugin_router', kind: 'person_left', match: { person_id: LAMP } },
    });
    expect(compileTriggerMatcher('trigger.presence', { event: 'sideways' }).ok).toBe(false);
  });

  it('camera detections pick the event kind and detection', () => {
    expect(
      compileTriggerMatcher('trigger.camera', { camera: LAMP, detection: 'baby_cry' }),
    ).toEqual({
      ok: true,
      matcher: { source: 'event', kind: 'sound', subject: LAMP, match: { detection: 'baby_cry' } },
    });
    expect(compileTriggerMatcher('trigger.camera', {})).toMatchObject({
      matcher: { kind: 'motion', match: { detection: 'motion' } },
    });
    expect(Object.keys(CAMERA_DETECTION_VARIANTS)).toContain('doorbell');
  });

  it('button presses match the action', () => {
    expect(compileTriggerMatcher('trigger.button', { device: LAMP, press: 'long_press' })).toEqual({
      ok: true,
      matcher: {
        source: 'event',
        kind: 'button',
        subject: LAMP,
        match: { action: 'long_press' },
      },
    });
  });

  it('a Value and a run status', () => {
    expect(compileTriggerMatcher('trigger.value', { value: LAMP })).toEqual({
      ok: true,
      matcher: { source: 'automation_value', kind: 'changed', subject: LAMP, field: 'value' },
    });
    expect(compileTriggerMatcher('trigger.run_status', { status: 'failed' })).toEqual({
      ok: true,
      matcher: { source: 'automation_run', kind: 'status', match: { status: 'failed' } },
    });
  });

  it('device health watches online flags and the battery level', () => {
    expect(compileTriggerMatcher('trigger.device_health', { hold: 600_000 })).toEqual({
      ok: true,
      matcher: {
        source: 'device',
        kind: 'online',
        test: { is: 'eq', to: false },
        holdSeconds: 600,
      },
    });
    expect(compileTriggerMatcher('trigger.device_health', { event: 'online' })).toMatchObject({
      matcher: { test: { is: 'eq', to: true } },
    });
    expect(
      compileTriggerMatcher('trigger.device_health', {
        event: 'battery_low',
        battery: 15,
        device: LAMP,
      }),
    ).toEqual({
      ok: true,
      matcher: {
        source: 'device',
        kind: 'state',
        subject: LAMP,
        field: 'battery',
        test: { is: 'lt', to: 15 },
      },
    });
    expect(compileTriggerMatcher('trigger.device_health', { event: 'battery_low' }).ok).toBe(false);
  });

  it('reports an invalid matcher and a reversed range', () => {
    expect(compileTriggerMatcher('trigger.signal', { source: 'Bad Name', kind: 'x' }).ok).toBe(
      false,
    );
    const range = compileTriggerMatcher('trigger.signal', {
      source: 'device',
      kind: 'state',
      test: { is: 'between', min: 9, max: 1 },
    });
    expect(range).toEqual({ ok: false, error: 'min must not exceed max' });
    const fine = compileTriggerMatcher('trigger.signal', {
      source: 'device',
      kind: 'state',
      test: { is: 'between', min: 1, max: 9 },
    });
    expect(fine.ok).toBe(true);
  });

  it('refuses kinds that are not signal-backed', () => {
    expect(compileTriggerMatcher('trigger.time', {})).toEqual({
      ok: false,
      error: 'trigger.time does not compile to a matcher',
    });
  });
});

describe('the eleven triggers that came after the first thirteen', () => {
  it('are shipped at the v1 tier, member access except the webhook', () => {
    expect(TRIGGER_V11_KINDS.map((each) => each.id).sort()).toEqual([
      'trigger.becomes_true',
      'trigger.chat',
      'trigger.computer',
      'trigger.event',
      'trigger.health',
      'trigger.hub_started',
      'trigger.phone',
      'trigger.schedule',
      'trigger.timer',
      'trigger.weather',
      'trigger.webhook',
    ]);
    for (const each of TRIGGER_V11_KINDS) {
      expect(each.tier).toBe('v1');
      expect(each.class).toBe('trigger');
      expect(each.access).toBe(each.id === 'trigger.webhook' ? 'owner' : 'member');
      expect(registry.shipped().some((shipped) => shipped.id === each.id)).toBe(true);
      expect(each.inputs.some((port) => port.name === 'filter')).toBe(false);
    }
  });

  it('the condition trigger watches a live condition and an optional hold, and is not signal-backed', () => {
    const condition = kind('trigger.becomes_true').inputs.find((port) => port.name === 'condition');
    expect(condition).toMatchObject({ type: { t: 'boolean' }, required: true, live: true });
    expect(condition?.static).toBeUndefined();
    expect(inputNames('trigger.becomes_true')).toEqual(['condition', 'hold']);
    expect(outputNames('trigger.becomes_true')).toEqual(['at']);
    expect(compileTriggerMatcher('trigger.becomes_true', {}).ok).toBe(false);
  });

  it('a game opened on one computer', () => {
    expect(
      compileTriggerMatcher('trigger.computer', {
        computer: 'desk',
        kind: 'app_open',
        app: 'Steam',
        cooldown: 60_000,
      }),
    ).toEqual({
      ok: true,
      matcher: {
        source: 'event',
        kind: 'app_opened',
        subject: 'desk',
        match: { app: 'Steam' },
        cooldownSeconds: 60,
      },
    });
  });

  it('closing and leaving the front use their own event kinds', () => {
    expect(compileTriggerMatcher('trigger.computer', { kind: 'app_close' })).toMatchObject({
      ok: true,
      matcher: { kind: 'app_closed' },
    });
    expect(compileTriggerMatcher('trigger.computer', { kind: 'app_unfocus' })).toMatchObject({
      ok: true,
      matcher: { kind: 'app_unfocused' },
    });
  });

  it('one power action is a kind of its own and shows what it matched', () => {
    expect(compileTriggerMatcher('trigger.computer', { kind: 'power_lock_screen' })).toMatchObject({
      ok: true,
      matcher: { kind: 'computer_power', match: { action: 'lock_screen' } },
    });
    expect(outputNames('trigger.computer')).toContain('action');
  });

  it('computer power and focus use their own event kinds', () => {
    expect(compileTriggerMatcher('trigger.computer', { kind: 'power' })).toMatchObject({
      ok: true,
      matcher: { kind: 'computer_power' },
    });
    expect(compileTriggerMatcher('trigger.computer', { kind: 'app_focus' })).toMatchObject({
      ok: true,
      matcher: { kind: 'app_focused' },
    });
  });

  it('refuses a computer kind that is not offered', () => {
    expect(compileTriggerMatcher('trigger.computer', { kind: 'idle' }).ok).toBe(false);
  });

  it('a phone unlocked, and a change of activity with its match', () => {
    expect(compileTriggerMatcher('trigger.phone', {})).toMatchObject({
      ok: true,
      matcher: { source: 'event', kind: 'phone_unlocked' },
    });
    expect(
      compileTriggerMatcher('trigger.phone', {
        kind: 'context_changed',
        to: 'driving',
        from: 'still',
      }),
    ).toMatchObject({
      ok: true,
      matcher: { kind: 'phone_context_changed', match: { to: 'driving', from: 'still' } },
    });
  });

  it('health defaults to sleep ending and takes a person, metric and test', () => {
    expect(compileTriggerMatcher('trigger.health', {})).toMatchObject({
      ok: true,
      matcher: { source: 'health', kind: 'sleep_ended' },
    });
    expect(
      compileTriggerMatcher('trigger.health', {
        kind: 'body_reading',
        person: 'ann',
        metric: 'weight_kg',
        test: { is: 'gt', to: 80 },
      }),
    ).toMatchObject({
      ok: true,
      matcher: {
        kind: 'body_reading',
        subject: 'ann',
        field: 'weight_kg',
        test: { is: 'gt', to: 80 },
      },
    });
  });

  it('chat matches how the reply ended', () => {
    expect(compileTriggerMatcher('trigger.chat', { chat: 'c1', outcome: 'failed' })).toMatchObject({
      ok: true,
      matcher: {
        source: 'assistant',
        kind: 'reply_finished',
        subject: 'c1',
        match: { outcome: 'failed' },
      },
    });
  });
});
