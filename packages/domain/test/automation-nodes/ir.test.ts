import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import { CLIMATE_POWER_CHOICES } from '../../src/automation-nodes/climate';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { IR_KINDS } from '../../src/automation-nodes/ir';
import { isOptionSourceId, isPortEditorId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';
import { IR_AC_MODES, IR_SPEED_STEPS, IR_TEMP_RANGE } from '../../src/ir-remote-state';

const kind = NODE_REGISTRY.get('ir.appliance_set');

function input(name: string): InputPortDecl | undefined {
  return kind?.inputs.find((port) => port.name === name);
}

describe('ir.appliance_set registration', () => {
  it('is one registered action kind with a unique id', () => {
    expect(kind).toBeDefined();
    expect(IR_KINDS.map((each) => each.id)).toEqual(['ir.appliance_set']);
    expect(ALL_NODE_KINDS.filter((each) => each.id === 'ir.appliance_set')).toHaveLength(1);
    expect(kind?.class).toBe('effect');
    expect(kind?.category).toBe('devices');
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it('declares the ports the objective names and the device output', () => {
    expect(kind?.inputs.map((port) => port.name)).toEqual([
      'appliance',
      'power',
      'mode',
      'temperature',
      'fan',
    ]);
    expect(kind?.outputs.map((port) => port.name)).toEqual(['device', 'error']);
    expect(kind?.exits).toEqual(['next']);
  });
});

describe('ir.appliance_set ports are typed with pickers', () => {
  it('picks the appliance from the infrared appliances', () => {
    expect(input('appliance')).toMatchObject({
      type: { t: 'text' },
      required: true,
      summary: true,
      ui: { optionsFrom: 'ir.appliances' },
    });
  });

  it('chooses power from on, off and keep, and keeps by default', () => {
    expect(input('power')).toMatchObject({
      type: { t: 'choice', options: [...CLIMATE_POWER_CHOICES] },
      required: false,
      default: 'keep',
    });
  });

  it('offers exactly the modes an infrared appliance has', () => {
    const type = input('mode')?.type;
    expect(type?.t).toBe('choice');
    expect(type?.t === 'choice' ? type.options.map((option) => option.id) : []).toEqual([
      ...IR_AC_MODES,
    ]);
    expect(input('mode')?.required).toBe(false);
  });

  it('takes the temperature and the fan speed as numbers within the ranges the appliance model declares', () => {
    expect(input('temperature')?.type).toEqual({ t: 'number' });
    expect(input('temperature')?.ui).toMatchObject({
      min: IR_TEMP_RANGE.min,
      max: IR_TEMP_RANGE.max,
      step: 1,
    });
    expect(input('fan')?.type).toEqual({ t: 'number' });
    expect(input('fan')?.ui).toMatchObject({ min: 1, max: IR_SPEED_STEPS, step: 1 });
  });

  it('has no any or raw record input and every picker and editor is a known id', () => {
    for (const port of kind?.inputs ?? []) {
      expect(port.type.t, port.name).not.toBe('any');
      expect(port.type.t, port.name).not.toBe('record');
      if (port.ui?.optionsFrom !== undefined)
        expect(isOptionSourceId(port.ui.optionsFrom)).toBe(true);
      if (port.ui?.editor !== undefined) expect(isPortEditorId(port.ui.editor)).toBe(true);
      expect(port.required && port.default !== undefined, port.name).toBe(false);
    }
  });

  it('summarises in plain words and shows unset values as absent', () => {
    const parts = renderSummary(kind?.summary ?? '', { temperature: { lit: 22 } });
    expect(summaryText(parts)).toBe('Set … to 22');
  });
});

describe('ir.appliance_set run mode and error exit', () => {
  it('sends by default and may wait for the appliance to confirm', () => {
    expect(kind?.effect).toEqual({
      retry: 'idempotent',
      budget: 'command',
      mode: 'fire_and_forget',
    });
    expect(modesOf(kind)).toEqual({
      default: 'fire_and_forget',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    expect(hasModeChoice(kind)).toBe(true);
    expect(runModeOf(kind, undefined)).toBe('fire_and_forget');
    expect(runModeOf(kind, 'wait_for_result')).toBe('wait_for_result');
  });

  it('is fallible, carries the shared error output and can route its failure', () => {
    expect(fallibleOf('ir.appliance_set', STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError('ir.appliance_set', STATIC_KIND_LOOKUP)).toBe(true);
    expect(kind?.outputs.at(-1)).toBe(ERROR_OUT);
    const wired = execPortsOf(
      'ir.appliance_set',
      {
        id: '00000000-0000-4000-8000-000000000001',
        key: 'ir',
        kind: 'ir.appliance_set',
        to: { onError: '00000000-0000-4000-8000-000000000002' },
      },
      STATIC_KIND_LOOKUP,
    );
    expect(wired.outputs.map((out) => out.port)).toContain('onError');
    expect(
      execPortsOf('ir.appliance_set', undefined, STATIC_KIND_LOOKUP).outputs.map((out) => out.port),
    ).not.toContain('onError');
  });
});

describe('the infrared pickers the existing nodes use are known sources', () => {
  it('lists remotes, buttons and appliances as picker sources', () => {
    const send = NODE_REGISTRY.get('device.ir_send');
    expect(send?.inputs.find((port) => port.name === 'remote')?.ui?.optionsFrom).toBe('ir.remotes');
    expect(send?.inputs.find((port) => port.name === 'button')?.ui?.optionsFrom).toBe('ir.buttons');
    expect(isOptionSourceId('ir.appliances')).toBe(true);
  });
});
