import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import {
  APP_ACTION_CHOICES,
  COMPUTER_SYSTEM_KINDS,
  POWER_MODE_CHOICES,
  SERVICE_OPERATION_CHOICES,
  SYSTEM_SETTING_CHOICES,
} from '../../src/automation-nodes/computer-system';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf } from '../../src/automation-nodes/run-modes';
import {
  POWER_MODES,
  SERVICE_OPERATIONS,
  SYSTEM_TOOL_CHANGE,
} from '../../src/node/computer-system';
import { COMPUTER_ACTIONS, POWER_ACTIONS } from '../../src/node/node-requests';
import { WINDOW_ACTIONS } from '../../src/node/computer-windows';

const IDS = ['computer.system', 'computer.app', 'computer.open'] as const;

function input(kindId: string, name: string): InputPortDecl | undefined {
  return NODE_REGISTRY.get(kindId)?.inputs.find((port) => port.name === name);
}

function choiceIds(kindId: string, name: string): readonly string[] {
  const type = input(kindId, name)?.type;
  return type?.t === 'choice' ? type.options.map((option) => option.id) : [];
}

describe('computer settings, app and open registration', () => {
  it.each(IDS)('%s is registered once as a valid computers action', (id) => {
    const kind = NODE_REGISTRY.get(id);
    expect(COMPUTER_SYSTEM_KINDS.filter((each) => each.id === id)).toHaveLength(1);
    expect(ALL_NODE_KINDS.filter((each) => each.id === id)).toHaveLength(1);
    expect(kind?.class).toBe('effect');
    expect(kind?.category).toBe('computers');
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it.each(IDS)('%s sends by default, can wait and has the error exit', (id) => {
    const kind = NODE_REGISTRY.get(id);
    expect(modesOf(kind)).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    expect(hasModeChoice(kind)).toBe(true);
    expect(kind?.outputs.at(-1)).toBe(ERROR_OUT);
    expect(fallibleOf(id, STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError(id, STATIC_KIND_LOOKUP)).toBe(true);
  });
});

describe('computer.system covers every setting of computer_system_set', () => {
  it('offers exactly the actions of the tool', () => {
    const actions = SYSTEM_TOOL_CHANGE.options.map((option) => option.shape.action.value);
    expect(choiceIds('computer.system', 'setting')).toEqual(actions);
    expect(SYSTEM_SETTING_CHOICES.map((choice) => choice.id)).toEqual(actions);
  });

  it('offers the power modes and service operations the computer accepts', () => {
    expect(choiceIds('computer.system', 'mode')).toEqual(POWER_MODES);
    expect(POWER_MODE_CHOICES.map((choice) => choice.id)).toEqual(POWER_MODES);
    expect(choiceIds('computer.system', 'operation')).toEqual(SERVICE_OPERATIONS);
    expect(SERVICE_OPERATION_CHOICES.map((choice) => choice.id)).toEqual(SERVICE_OPERATIONS);
  });

  it('picks networks, Bluetooth devices and services from what the computer reports', () => {
    expect(input('computer.system', 'network')?.ui?.optionsFrom).toBe('computer.networks');
    expect(input('computer.system', 'device')?.ui?.optionsFrom).toBe('computer.bluetooth_devices');
    expect(input('computer.system', 'unit')?.ui?.optionsFrom).toBe('computer.services');
  });

  it('picks the keyboard layout and the startup app instead of asking for typed names', () => {
    expect(input('computer.system', 'layout')?.ui?.optionsFrom).toBe('computer.keyboard_layouts');
    expect(input('computer.system', 'startupApp')?.ui?.optionsFrom).toBe('computer.startup_apps');
  });

  it('declares every picker source and has no raw record input', () => {
    const kind = NODE_REGISTRY.get('computer.system');
    for (const port of kind?.inputs ?? []) {
      const source = port.ui?.optionsFrom;
      if (source !== undefined) expect(isOptionSourceId(source), port.name).toBe(true);
      expect(['any', 'record'], port.name).not.toContain(port.type.t);
    }
  });

  it('requires only the computer and the setting', () => {
    const required = NODE_REGISTRY.get('computer.system')
      ?.inputs.filter((port) => port.required)
      .map((port) => port.name);
    expect(required).toEqual(['computer', 'setting']);
  });
});

describe('computer.app and computer.open', () => {
  it('offers open, close, focus and minimise, the window actions matching the tool', () => {
    expect(choiceIds('computer.app', 'action')).toEqual(['open', 'close', 'focus', 'minimise']);
    expect(APP_ACTION_CHOICES.map((choice) => choice.id)).toEqual(
      expect.arrayContaining(WINDOW_ACTIONS.filter((action) => action !== 'close')),
    );
  });

  it('picks the app from the apps installed on the computer and forces off by default', () => {
    expect(input('computer.app', 'app')?.ui?.optionsFrom).toBe('computer.apps');
    expect(input('computer.app', 'app')?.required).toBe(true);
    expect(input('computer.app', 'force')?.default).toBe(false);
  });

  it('opens a link or a path', () => {
    expect(input('computer.open', 'url')?.required).toBe(false);
    expect(input('computer.open', 'path')?.required).toBe(false);
    expect(NODE_REGISTRY.get('computer.open')?.icon).toBe('externalLink');
  });
});

describe('computer.power wake', () => {
  it('adds wake to the actions and keeps every earlier one', () => {
    expect(choiceIds('computer.power', 'action')).toEqual(COMPUTER_ACTIONS);
    for (const action of POWER_ACTIONS) {
      expect(choiceIds('computer.power', 'action')).toContain(action);
    }
    expect(choiceIds('computer.power', 'action')).toContain('wake');
  });

  it('keeps the computer, the action and the ok output, and gains the error exit', () => {
    const kind = NODE_REGISTRY.get('computer.power');
    expect(kind?.inputs.map((port) => port.name)).toEqual(['computer', 'action']);
    expect(kind?.outputs.map((port) => port.name)).toEqual(['ok', 'error']);
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it('leaves the power actions a computer performs itself without wake', () => {
    expect(POWER_ACTIONS).not.toContain('wake');
  });
});
