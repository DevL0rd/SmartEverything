import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import {
  AUDIO_ACTION_CHOICES,
  DISPLAY_ACTION_CHOICES,
} from '../../src/automation-nodes/computer-ports';
import { COMPUTERS_PHONES_KINDS } from '../../src/automation-nodes/computers-phones';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { AUDIO_ACTIONS } from '../../src/node/computer-audio';
import { DISPLAY_TOOL_ACTIONS } from '../../src/node/computer-displays';

const IDS = ['computer.audio', 'computer.display'] as const;

function input(kindId: string, name: string): InputPortDecl | undefined {
  return NODE_REGISTRY.get(kindId)?.inputs.find((port) => port.name === name);
}

function choiceIds(kindId: string, name: string): readonly string[] {
  const type = input(kindId, name)?.type;
  return type?.t === 'choice' ? type.options.map((option) => option.id) : [];
}

describe('computer sound and screen registration', () => {
  it.each(IDS)('%s is registered once as a valid computers action', (id) => {
    const kind = NODE_REGISTRY.get(id);
    expect(COMPUTERS_PHONES_KINDS.filter((each) => each.id === id)).toHaveLength(1);
    expect(ALL_NODE_KINDS.filter((each) => each.id === id)).toHaveLength(1);
    expect(kind?.class).toBe('effect');
    expect(kind?.category).toBe('computers');
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it('offers every action of computer_audio_set', () => {
    expect(choiceIds('computer.audio', 'action')).toEqual(AUDIO_ACTIONS);
    expect(AUDIO_ACTION_CHOICES.map((choice) => choice.id)).toEqual(AUDIO_ACTIONS);
  });

  it('offers every action of computer_display_set, keep and revert included', () => {
    expect(choiceIds('computer.display', 'action')).toEqual(DISPLAY_TOOL_ACTIONS);
    expect(DISPLAY_ACTION_CHOICES.map((choice) => choice.id)).toEqual(DISPLAY_TOOL_ACTIONS);
    for (const wanted of ['hdr', 'rotation', 'primary', 'enable', 'disable', 'mirror', 'vrr']) {
      expect(choiceIds('computer.display', 'action')).toContain(wanted);
    }
  });
});

describe('computer sound and screen ports are typed with pickers', () => {
  it('picks sound devices and apps from what the computer reports', () => {
    expect(input('computer.audio', 'device')?.ui?.optionsFrom).toBe('computer.audio_devices');
    expect(input('computer.audio', 'output')?.ui?.optionsFrom).toBe('computer.audio_devices');
    expect(input('computer.audio', 'app')?.ui?.optionsFrom).toBe('computer.audio_apps');
    expect(choiceIds('computer.audio', 'kind')).toEqual(['output', 'input']);
  });

  it('picks every screen field from the screens the computer reports', () => {
    for (const name of ['output', 'relativeTo', 'mirrorOf']) {
      expect(input('computer.display', name)?.ui?.optionsFrom, name).toBe('computer.displays');
    }
  });

  it('takes the ranges from the tool and not from invented limits', () => {
    expect(input('computer.audio', 'level')?.ui).toMatchObject({ min: 0, max: 150, unit: '%' });
    expect(input('computer.display', 'scale')?.ui).toMatchObject({ min: 50, max: 400 });
    expect(input('computer.display', 'brightness')?.ui).toMatchObject({ min: 0, max: 100 });
    expect(input('computer.display', 'temperature')?.ui).toMatchObject({ min: 1000, max: 6500 });
    expect(choiceIds('computer.display', 'rotation')).toEqual(['0', '90', '180', '270']);
    expect(choiceIds('computer.display', 'side')).toEqual(['left', 'right', 'above', 'below']);
    expect(choiceIds('computer.display', 'vrr')).toEqual(['never', 'always', 'automatic']);
    expect(choiceIds('computer.display', 'nightLight')).toEqual(['off', 'on', 'scheduled']);
  });

  it.each(IDS)('%s has no change record and no raw record input', (id) => {
    const kind = NODE_REGISTRY.get(id);
    expect(input(id, 'change')).toBeUndefined();
    expect(input(id, 'action')).toMatchObject({ required: true });
    for (const port of kind?.inputs ?? []) {
      expect(['any', 'record'], port.name).not.toContain(port.type.t);
      if (port.ui?.optionsFrom !== undefined)
        expect(isOptionSourceId(port.ui.optionsFrom), port.name).toBe(true);
    }
  });

  it.each(IDS)('%s keeps its computer, ok output and next exit', (id) => {
    const kind = NODE_REGISTRY.get(id);
    expect(input(id, 'computer')).toMatchObject({
      required: true,
      type: { t: 'ref', of: 'computer' },
    });
    expect(kind?.outputs[0]).toMatchObject({ name: 'ok', type: { t: 'boolean' } });
    expect(kind?.exits).toEqual(['next']);
  });
});

describe('computer sound and screen error exit', () => {
  it.each(IDS)('%s is fallible, carries the shared error output and can route a failure', (id) => {
    expect(fallibleOf(id, STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError(id, STATIC_KIND_LOOKUP)).toBe(true);
    expect(NODE_REGISTRY.get(id)?.outputs.at(-1)).toBe(ERROR_OUT);
  });
});
