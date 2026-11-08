import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import {
  CLIMATE_CONTROLS,
  CLIMATE_KINDS,
  CLIMATE_POWER_CHOICES,
  CLIMATE_TEMPERATURE_UNITS,
} from '../../src/automation-nodes/climate';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId, isPortEditorId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';

const kind = NODE_REGISTRY.get('climate.set');

function input(name: string): InputPortDecl | undefined {
  return kind?.inputs.find((port) => port.name === name);
}

describe('climate.set registration', () => {
  it('is one registered action kind with a unique id', () => {
    expect(kind).toBeDefined();
    expect(CLIMATE_KINDS.map((each) => each.id)).toEqual(['climate.set']);
    expect(ALL_NODE_KINDS.filter((each) => each.id === 'climate.set')).toHaveLength(1);
    expect(kind?.class).toBe('effect');
    expect(kind?.category).toBe('devices');
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it('declares the ports the objective names and the sent and skipped outputs', () => {
    expect(kind?.inputs.map((port) => port.name)).toEqual([
      'target',
      'power',
      'mode',
      'temperature',
      'unit',
      'fan',
      'fanSpeed',
      'swing',
      'oscillation',
      'offTimer',
    ]);
    expect(kind?.outputs.map((port) => port.name)).toEqual(['sent', 'skipped', 'error']);
    expect(kind?.exits).toEqual(['next']);
  });
});

describe('climate.set ports are typed with pickers', () => {
  it('takes a required target like Change device, so devices, rooms and groups wire in', () => {
    expect(input('target')).toMatchObject({
      type: { t: 'ref', of: 'target' },
      required: true,
      summary: true,
    });
  });

  it('chooses power from on, off and keep, and keeps by default', () => {
    expect(CLIMATE_POWER_CHOICES.map((choice) => choice.id)).toEqual(['on', 'off', 'keep']);
    expect(input('power')).toMatchObject({
      type: { t: 'choice', options: [...CLIMATE_POWER_CHOICES] },
      required: false,
      default: 'keep',
    });
  });

  it('offers mode, fan and swing as choices from the picked device', () => {
    const sources = {
      mode: 'climate.modes',
      fan: 'climate.fan_modes',
      swing: 'climate.swing_modes',
    };
    for (const [name, source] of Object.entries(sources)) {
      expect(input(name)?.ui?.optionsFrom, name).toBe(source);
      expect(input(name)?.required, name).toBe(false);
    }
  });

  it('takes the temperature as a number with a unit choice of Celsius or Fahrenheit and no invented range', () => {
    expect(input('temperature')?.type).toEqual({ t: 'number' });
    expect(input('temperature')?.ui).not.toHaveProperty('min');
    expect(input('temperature')?.ui).not.toHaveProperty('max');
    expect(CLIMATE_TEMPERATURE_UNITS.map((unit) => unit.id)).toEqual(['c', 'f']);
    expect(input('unit')).toMatchObject({
      type: { t: 'choice', options: [...CLIMATE_TEMPERATURE_UNITS] },
      default: 'c',
    });
    expect(input('fanSpeed')?.type).toEqual({ t: 'number' });
    expect(input('fanSpeed')?.ui).not.toHaveProperty('max');
  });

  it('takes oscillation as a boolean and the off timer as a duration', () => {
    expect(input('oscillation')?.type).toEqual({ t: 'boolean' });
    expect(input('offTimer')).toMatchObject({
      type: { t: 'duration' },
      ui: { editor: 'duration' },
    });
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

  it('names the standard controls each port drives', () => {
    expect(CLIMATE_CONTROLS.temperature).toEqual(['target_temperature']);
    expect(CLIMATE_CONTROLS.mode).toEqual(['hvac_mode', 'mode']);
    expect(CLIMATE_CONTROLS.offTimer).toEqual(['off_timer']);
  });

  it('summarises in plain words and shows unset values as absent', () => {
    const parts = renderSummary(kind?.summary ?? '', { temperature: { lit: 22 } });
    expect(summaryText(parts)).toBe('Set climate of … to 22');
  });
});

describe('climate.set run mode and error exit', () => {
  it('sends by default and may wait for the devices to confirm', () => {
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
    expect(fallibleOf('climate.set', STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError('climate.set', STATIC_KIND_LOOKUP)).toBe(true);
    expect(kind?.outputs.at(-1)).toBe(ERROR_OUT);
    const wired = execPortsOf(
      'climate.set',
      {
        id: '00000000-0000-4000-8000-000000000001',
        key: 'climate',
        kind: 'climate.set',
        to: { onError: '00000000-0000-4000-8000-000000000002' },
      },
      STATIC_KIND_LOOKUP,
    );
    expect(wired.outputs.map((out) => out.port)).toContain('onError');
    expect(
      execPortsOf('climate.set', undefined, STATIC_KIND_LOOKUP).outputs.map((out) => out.port),
    ).not.toContain('onError');
  });
});
