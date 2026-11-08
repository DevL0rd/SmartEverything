import { describe, expect, it } from 'vitest';
import type { FlowType } from '../../src/automation-v3/types';
import { ALL_NODE_KINDS, type PortUi } from '../../src/automation-nodes';

type Expected = readonly [kind: string, port: string, ui: PortUi];

const CONTROL_KINDS = [
  'device.set',
  'device.set_temporarily',
  'device.toggle',
  'device.ensure',
  'device.fade',
] as const;

const TEST_TRIGGERS = [
  'trigger.device',
  'trigger.presence',
  'trigger.camera',
  'trigger.value',
  'trigger.health',
  'trigger.weather',
] as const;

const READ_CONTROL_KINDS = [
  'device.get',
  'device.aggregate',
  'state.history',
  'state.window_stats',
  'state.compare_past',
] as const;

const EXPECTED: readonly Expected[] = [
  ['device.set', 'to', { typedBy: 'control' }],
  ['device.set_temporarily', 'to', { typedBy: 'control' }],
  ['device.ensure', 'to', { typedBy: 'control' }],
  ['device.aggregate', 'matches', { typedBy: 'control' }],
  ['state.history', 'stateEquals', { typedBy: 'control' }],
  ['device.snapshot', 'controls', { optionsFrom: 'device.controls', multiple: true }],
  ['device.query', 'families', { optionsFrom: 'device.families', multiple: true }],
  ['device.query', 'roles', { optionsFrom: 'device.roles', multiple: true }],
  ['device.query', 'labels', { optionsFrom: 'device.labels', multiple: true }],
  ['device.operation', 'operation', { optionsFrom: 'device.operations' }],
  ['device.operation', 'args', { typedBy: 'operation' }],
  ['device.ir_send', 'remote', { optionsFrom: 'ir.remotes' }],
  ['device.ir_send', 'button', { optionsFrom: 'ir.buttons' }],
  ['tool.call', 'tool', { optionsFrom: 'tools' }],
  ['tool.call', 'args', { typedBy: 'tool' }],
  ['ai.ask', 'tools', { optionsFrom: 'tools', multiple: true }],
  ['ai.ask', 'model', { optionsFrom: 'models.chat' }],
  ['ai.vision', 'model', { optionsFrom: 'models.chat' }],
  ['ai.decide', 'model', { optionsFrom: 'models.chat' }],
  ['ai.ask', 'shape', { editor: 'field-rows' }],
  ['ai.vision', 'shape', { editor: 'field-rows' }],
  ['phone.action', 'action', { editor: 'phone-action' }],
  ['var.get', 'name', { optionsFrom: 'variables' }],
  ['var.set', 'name', { optionsFrom: 'variables' }],
  ['var.change', 'name', { optionsFrom: 'variables' }],
  ['var.set', 'to', { typedBy: 'name' }],
  ['var.change', 'amount', { typedBy: 'name' }],
  ['var.change', 'steps', { typedBy: 'name' }],
  ['var.change', 'field', { optionsFrom: 'record.fields', typedBy: 'name' }],
  ['trigger.device', 'role', { optionsFrom: 'device.roles' }],
  ['trigger.device', 'control', { optionsFrom: 'device.controls' }],
  ['trigger.signal', 'source', { optionsFrom: 'signal.sources' }],
  ['trigger.signal', 'kind', { optionsFrom: 'signal.kinds' }],
  ['trigger.signal', 'subject', { optionsFrom: 'signal.subjects' }],
  ['trigger.signal', 'field', { optionsFrom: 'signal.fields' }],
  ['trigger.signal', 'match', { editor: 'field-rows', typedBy: 'kind' }],
  ['flow.wait_event', 'source', { optionsFrom: 'signal.sources' }],
  ['flow.wait_event', 'kind', { optionsFrom: 'signal.kinds' }],
  ['flow.wait_event', 'subject', { optionsFrom: 'signal.subjects' }],
  ['flow.wait_event', 'field', { optionsFrom: 'signal.fields' }],
  ['flow.wait_event', 'match', { editor: 'field-rows', typedBy: 'kind' }],
  ['signal.latest', 'source', { optionsFrom: 'signal.sources' }],
  ['signal.latest', 'kind', { optionsFrom: 'signal.kinds' }],
  ['signal.latest', 'subject', { optionsFrom: 'signal.subjects' }],
  ['signal.latest', 'field', { optionsFrom: 'signal.fields' }],
  ['signal.emit', 'payload', { editor: 'field-rows' }],
  ['trigger.speech', 'source', { optionsFrom: 'speech.sources' }],
  ['trigger.computer', 'computer', { optionsFrom: 'computers' }],
  ['trigger.computer', 'app', { optionsFrom: 'computer.apps' }],
  ['trigger.phone', 'to', { optionsFrom: 'phone.contexts' }],
  ['trigger.phone', 'from', { optionsFrom: 'phone.contexts' }],
  ['trigger.health', 'metric', { optionsFrom: 'health.metrics' }],
  ['trigger.weather', 'to', { optionsFrom: 'weather.conditions' }],
  ['trigger.weather', 'from', { optionsFrom: 'weather.conditions' }],
  ['trigger.chat', 'chat', { optionsFrom: 'chats' }],
  ['trigger.event', 'name', { optionsFrom: 'events.emitted' }],
  ['trigger.timer', 'timer', { optionsFrom: 'timers.this' }],
  ['trigger.schedule', 'blocks', { editor: 'week-grid' }],
  ['trigger.schedule', 'except', { editor: 'date-list' }],
  ['logic.trigger_is', 'source', { optionsFrom: 'triggers.this' }],
  ['logic.compare', 'b', { typedBy: 'a' }],
  ['logic.between', 'min', { typedBy: 'value' }],
  ['logic.between', 'max', { typedBy: 'value' }],
  ['logic.in', 'list', { typedBy: 'value' }],
  ['logic.coalesce', 'b', { typedBy: 'a' }],
  ['logic.coalesce', 'default', { typedBy: 'a' }],
  ['logic.select', 'whenFalse', { typedBy: 'whenTrue' }],
  ['list.filter', 'field', { optionsFrom: 'record.fields', typedBy: 'list' }],
  ['list.find', 'field', { optionsFrom: 'record.fields', typedBy: 'list' }],
  ['list.any', 'field', { optionsFrom: 'record.fields', typedBy: 'list' }],
  ['list.all', 'field', { optionsFrom: 'record.fields', typedBy: 'list' }],
  ['list.filter', 'value', { typedBy: 'field' }],
  ['list.find', 'value', { typedBy: 'field' }],
  ['list.any', 'value', { typedBy: 'field' }],
  ['list.all', 'value', { typedBy: 'field' }],
  ['list.sort', 'field', { optionsFrom: 'record.fields', typedBy: 'list' }],
  ['list.unique', 'field', { optionsFrom: 'record.fields', typedBy: 'list' }],
  ['list.field', 'field', { optionsFrom: 'record.fields', typedBy: 'list' }],
  ['object.get', 'path', { optionsFrom: 'record.fields', typedBy: 'source' }],
  ['object.set', 'path', { optionsFrom: 'record.fields', typedBy: 'source' }],
  ['object.set', 'value', { typedBy: 'path' }],
  ['object.remove', 'path', { optionsFrom: 'record.fields', typedBy: 'source' }],
  ['object.make', 'fields', { editor: 'field-rows' }],
  ['object.pick', 'keys', { optionsFrom: 'record.fields', typedBy: 'source', multiple: true }],
  ['state.machine', 'states', { editor: 'state-list' }],
  ['state.machine', 'initial', { typedBy: 'states' }],
  ['state.machine', 'transitions', { typedBy: 'states' }],
  ['http.request', 'headers', { editor: 'key-value-rows' }],
  ['http.request', 'query', { editor: 'key-value-rows' }],
  ['http.request', 'body', { editor: 'field-rows', typedBy: 'bodyKind' }],
  ['http.respond', 'headers', { editor: 'key-value-rows' }],
  ['http.respond', 'body', { editor: 'field-rows' }],
  ['util.lookup', 'rows', { editor: 'lookup-table' }],
  ['util.convert', 'default', { typedBy: 'to' }],
  ['notify.person', 'link', { optionsFrom: 'app.pages' }],
  ['notify.person', 'sound', { optionsFrom: 'phone.sounds' }],
  ['notify.speak', 'voice', { optionsFrom: 'voices' }],
  ['notify.speak', 'channel', { optionsFrom: 'talk.channels' }],
  ['date.parse', 'zone', { optionsFrom: 'time_zones' }],
  ['date.format', 'locale', { optionsFrom: 'locales' }],
  ['text.speakable', 'locale', { optionsFrom: 'locales' }],
];

function typeOf(kindId: string, portName: string): FlowType | undefined {
  return ALL_NODE_KINDS.find((kind) => kind.id === kindId)?.inputs.find(
    (port) => port.name === portName,
  )?.type;
}

function categoryOf(kindId: string): string | undefined {
  return ALL_NODE_KINDS.find((kind) => kind.id === kindId)?.category;
}

function inputOf(kindId: string, portName: string): { readonly ui: PortUi | undefined } {
  const kind = ALL_NODE_KINDS.find((candidate) => candidate.id === kindId);
  if (kind === undefined) throw new Error(`no kind ${kindId}`);
  const port = kind.inputs.find((candidate) => candidate.name === portName);
  if (port === undefined) throw new Error(`no input ${portName} on ${kindId}`);
  return { ui: port.ui };
}

describe('port annotations of the existing kinds', () => {
  it.each(EXPECTED)('%s %s carries its picker or editor', (kindId, portName, expected) => {
    expect(inputOf(kindId, portName).ui).toMatchObject(expected);
  });

  it.each(CONTROL_KINDS)('%s lists only controls that can be set', (kindId) => {
    expect(inputOf(kindId, 'control').ui).toMatchObject({
      optionsFrom: 'device.writable_controls',
    });
  });

  it.each(READ_CONTROL_KINDS)('%s lists every control of the device', (kindId) => {
    expect(inputOf(kindId, 'control').ui).toMatchObject({ optionsFrom: 'device.controls' });
  });

  it.each(TEST_TRIGGERS)('%s builds its test with the condition editor', (kindId) => {
    expect(inputOf(kindId, 'test').ui).toMatchObject({ editor: 'condition' });
  });

  it('keeps the port types of the annotated ports unchanged', () => {
    expect(typeOf('device.set', 'to')).toEqual({ t: 'any' });
    expect(typeOf('device.set', 'control')).toEqual({ t: 'text' });
    expect(typeOf('trigger.computer', 'computer')).toEqual({ t: 'ref', of: 'device' });
    expect(typeOf('trigger.signal', 'match')).toEqual({ t: 'record', values: { t: 'any' } });
    expect(typeOf('object.pick', 'keys')).toEqual({ t: 'list', of: { t: 'text' } });
  });

  it('files the signal nodes under automations and health under people', () => {
    expect(categoryOf('signal.emit')).toBe('automations');
    expect(categoryOf('signal.latest')).toBe('automations');
    expect(categoryOf('health.read')).toBe('people');
    expect(categoryOf('camera.snapshot')).toBe('cameras');
  });

  it('files the weather nodes under weather', () => {
    expect(categoryOf('weather.read')).toBe('weather');
    expect(categoryOf('weather.forecast')).toBe('weather');
  });

  it('leaves the class and exits of health.read as stored programs wire them', () => {
    const kind = ALL_NODE_KINDS.find((candidate) => candidate.id === 'health.read');
    expect(kind?.class).toBe('effect');
    expect(kind?.exits).toEqual(['next']);
  });
});
