import { describe, expect, it } from 'vitest';
import {
  ALL_NODE_KINDS,
  OPTION_SOURCES,
  OPTION_SOURCE_IDS,
  OPTION_SOURCE_YIELDS,
  PORT_EDITORS,
  defineNodeKind,
  isOptionSourceId,
  isPortEditorId,
  kindProblems,
  optionSourceOf,
  registryProblems,
  type InputPortDecl,
  type NodeKind,
  type PortUi,
} from '../../src/automation-nodes';

const BASE: NodeKind = defineNodeKind({
  id: 'device.example',
  name: 'Example',
  category: 'devices',
  icon: 'sun',
  class: 'effect',
  description: 'Does a thing.',
  inputs: [
    { name: 'control', type: { t: 'text' }, required: false, description: 'Which control.' },
    { name: 'to', type: { t: 'any' }, required: false, description: 'The value.' },
  ],
  outputs: [],
  exits: ['next'],
  effect: { retry: 'idempotent', budget: 'command' },
  summary: 'Example {control}',
  keywords: [],
  access: 'member',
  tier: 'v1',
});

function withUi(name: string, ui: PortUi): NodeKind {
  const inputs: readonly InputPortDecl[] = BASE.inputs.map((port) =>
    port.name === name ? { ...port, ui } : port,
  );
  return { ...BASE, inputs };
}

function rawUi(value: object): PortUi {
  return Object.assign({}, value);
}

describe('option source table', () => {
  it('lists every id once with a meaning and a known value kind', () => {
    expect(new Set(OPTION_SOURCE_IDS).size).toBe(OPTION_SOURCES.length);
    for (const source of OPTION_SOURCES) {
      expect(source.meaning.trim()).not.toBe('');
      expect(OPTION_SOURCE_YIELDS).toContain(source.yields);
    }
    expect(new Set(PORT_EDITORS).size).toBe(PORT_EDITORS.length);
  });

  it('holds every source and editor the node library needs', () => {
    for (const id of [
      'device.controls',
      'device.writable_controls',
      'device.actions',
      'device.enum_values',
      'ir.remotes',
      'ir.buttons',
      'tools',
      'variables',
      'values',
      'plugin.entity',
      'time_zones',
      'locales',
      'computer.audio_apps',
      'vacuum.rooms',
    ]) {
      expect(isOptionSourceId(id)).toBe(true);
    }
    for (const id of ['control-value', 'condition', 'week-grid', 'phone-action', 'key-combo']) {
      expect(isPortEditorId(id)).toBe(true);
    }
    expect(isOptionSourceId('made.up')).toBe(false);
    expect(isPortEditorId('made-up')).toBe(false);
  });

  it('maps reference sources to the thing they yield', () => {
    expect(optionSourceOf('rooms').yields).toBe('room');
    expect(optionSourceOf('people').yields).toBe('person');
    expect(optionSourceOf('variables').yields).toBe('variable');
    expect(optionSourceOf('device.controls').yields).toBe('choice');
  });

  it('is used by every current kind only through ids of the table', () => {
    expect(registryProblems(ALL_NODE_KINDS)).toEqual([]);
    const used = ALL_NODE_KINDS.flatMap((kind) => kind.inputs.map((port) => port.ui));
    expect(used.filter((ui) => ui?.optionsFrom !== undefined).length).toBeGreaterThan(0);
    for (const ui of used) {
      if (ui?.optionsFrom !== undefined) expect(isOptionSourceId(ui.optionsFrom)).toBe(true);
      if (ui?.editor !== undefined) expect(isPortEditorId(ui.editor)).toBe(true);
    }
  });
});

describe('port annotations in kindProblems', () => {
  it('accepts known sources, editors, typed-by links and multiple', () => {
    expect(kindProblems(BASE)).toEqual([]);
    expect(
      kindProblems(withUi('control', { optionsFrom: 'device.writable_controls', multiple: true })),
    ).toEqual([]);
    expect(kindProblems(withUi('to', { editor: 'control-value', typedBy: 'control' }))).toEqual([]);
  });

  it('rejects an unknown picker source', () => {
    expect(kindProblems(withUi('control', rawUi({ optionsFrom: 'device.nothing' })))).toEqual([
      'input "control" uses the unknown picker source "device.nothing"',
    ]);
  });

  it('rejects an unknown editor', () => {
    expect(kindProblems(withUi('to', rawUi({ editor: 'sparkle' })))).toEqual([
      'input "to" uses the unknown editor "sparkle"',
    ]);
  });

  it('rejects a typed-by link to no input or to itself', () => {
    expect(kindProblems(withUi('to', { typedBy: 'missing' }))).toEqual([
      'input "to" is typed by "missing", which is not another input',
    ]);
    expect(kindProblems(withUi('to', { typedBy: 'to' }))).toEqual([
      'input "to" is typed by "to", which is not another input',
    ]);
  });
});

describe('modes and origin in kindProblems', () => {
  it('accepts a coherent mode table and origin', () => {
    const kind: NodeKind = {
      ...BASE,
      fallible: true,
      modes: { default: 'fire_and_forget', allowed: ['fire_and_forget', 'wait_for_result'] },
      origin: {
        kind: 'plugin',
        id: 'shelly_presence',
        name: 'Shelly',
        icon: 'plug',
        version: '1.0.0',
      },
    };
    expect(kindProblems(kind)).toEqual([]);
  });

  it('rejects a default outside the allowed modes, empty and repeated modes', () => {
    expect(
      kindProblems({
        ...BASE,
        modes: { default: 'wait_for_result', allowed: ['fire_and_forget'] },
      }),
    ).toEqual(['the default mode "wait_for_result" is not an allowed mode']);
    expect(kindProblems({ ...BASE, modes: { default: 'wait_for_result', allowed: [] } })).toContain(
      'modes allow no mode',
    );
    expect(
      kindProblems({
        ...BASE,
        modes: { default: 'wait_for_result', allowed: ['wait_for_result', 'wait_for_result'] },
      }),
    ).toEqual(['a mode is allowed twice']);
  });

  it('rejects an origin with an empty field', () => {
    expect(
      kindProblems({
        ...BASE,
        origin: { kind: 'driver', id: 'driver_x', name: ' ', icon: 'plug', version: '1' },
      }),
    ).toEqual(['the origin name is empty']);
  });
});
