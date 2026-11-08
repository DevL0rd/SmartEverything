import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import type { InputPortDecl } from '../../src/automation-nodes/define';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, execPortsOf, fallibleOf } from '../../src/automation-nodes/exec-ports';
import {
  LIGHT_BRIGHTNESS_RANGE,
  LIGHT_KINDS,
  LIGHT_POWER_CHOICES,
} from '../../src/automation-nodes/lights';
import { LIGHT_SET_PRESETS } from '../../src/automation-nodes/presets';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';
import { isOptionSourceId, isPortEditorId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { renderSummary, summaryText } from '../../src/automation-nodes/summary-template';

const kind = NODE_REGISTRY.get('light.set');

function input(name: string): InputPortDecl | undefined {
  return kind?.inputs.find((port) => port.name === name);
}

describe('light.set registration', () => {
  it('is one registered action kind with a unique id', () => {
    expect(kind).toBeDefined();
    expect(LIGHT_KINDS.map((each) => each.id)).toEqual(['light.set']);
    expect(ALL_NODE_KINDS.filter((each) => each.id === 'light.set')).toHaveLength(1);
    expect(kind?.class).toBe('effect');
    expect(kind?.category).toBe('devices');
    expect(kind === undefined ? ['missing'] : kindProblems(kind)).toEqual([]);
  });

  it('declares only the ports the objective names', () => {
    expect(kind?.inputs.map((port) => port.name)).toEqual([
      'target',
      'power',
      'brightness',
      'color',
      'colorTemperature',
      'effect',
      'transition',
    ]);
    expect(kind?.outputs.map((port) => port.name)).toEqual(['sent', 'skipped', 'error']);
    expect(kind?.exits).toEqual(['next']);
  });
});

describe('light.set ports are typed with pickers', () => {
  it('takes a required target like Change device, so devices, rooms and groups wire in', () => {
    expect(input('target')).toMatchObject({
      type: { t: 'ref', of: 'target' },
      required: true,
      summary: true,
    });
  });

  it('chooses power from on, off and keep, and keeps by default', () => {
    expect(LIGHT_POWER_CHOICES.map((choice) => choice.id)).toEqual(['on', 'off', 'keep']);
    expect(input('power')).toMatchObject({
      type: { t: 'choice', options: [...LIGHT_POWER_CHOICES] },
      required: false,
      default: 'keep',
    });
  });

  it('takes brightness as a percent and the colour and white through their editors', () => {
    expect(input('brightness')?.type).toEqual({ t: 'number', min: 0, max: 100, unit: '%' });
    expect(LIGHT_BRIGHTNESS_RANGE).toEqual({ min: 0, max: 100 });
    expect(input('brightness')?.ui).toMatchObject({ min: 0, max: 100, unit: '%' });
    expect(input('color')).toMatchObject({ type: { t: 'color' }, ui: { editor: 'colour' } });
    expect(input('colorTemperature')).toMatchObject({
      type: { t: 'number', integer: true, unit: 'K' },
      ui: { editor: 'kelvin', unit: 'K' },
    });
    expect(input('colorTemperature')?.type).not.toHaveProperty('max');
  });

  it('picks the effect from the light effects and the fade as a duration', () => {
    expect(input('effect')?.ui).toMatchObject({ optionsFrom: 'light.effects' });
    expect(input('transition')).toMatchObject({ type: { t: 'duration' }, static: true });
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
    const parts = renderSummary(kind?.summary ?? '', {
      brightness: { lit: 40 },
    });
    expect(summaryText(parts)).toBe('Set lights … to 40');
  });
});

describe('light.set run mode and error exit', () => {
  it('sends by default and may wait for the lights to confirm', () => {
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
    expect(fallibleOf('light.set', STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError('light.set', STATIC_KIND_LOOKUP)).toBe(true);
    expect(kind?.outputs.at(-1)).toBe(ERROR_OUT);
    const wired = execPortsOf(
      'light.set',
      {
        id: '00000000-0000-4000-8000-000000000001',
        key: 'lights',
        kind: 'light.set',
        to: { onError: '00000000-0000-4000-8000-000000000002' },
      },
      STATIC_KIND_LOOKUP,
    );
    expect(wired.outputs.map((out) => out.port)).toContain('onError');
    expect(
      execPortsOf('light.set', undefined, STATIC_KIND_LOOKUP).outputs.map((out) => out.port),
    ).not.toContain('onError');
  });
});

describe('light.set palette presets', () => {
  const portNames = new Set(kind?.inputs.map((port) => port.name));
  const powerIds = LIGHT_POWER_CHOICES.map((choice) => choice.id);

  it('have unique ids and target the registered kind with ports it declares', () => {
    expect(new Set(LIGHT_SET_PRESETS.map((preset) => preset.id)).size).toBe(
      LIGHT_SET_PRESETS.length,
    );
    for (const preset of LIGHT_SET_PRESETS) {
      expect(preset.kindId).toBe('light.set');
      expect(NODE_REGISTRY.has(preset.kindId)).toBe(true);
      expect(Object.keys(preset.ports).length, preset.id).toBeGreaterThan(0);
      for (const name of Object.keys(preset.ports)) expect(portNames.has(name), name).toBe(true);
      expect(preset.name.trim(), preset.id).not.toBe('');
      expect(preset.meaning.trim(), preset.id).not.toBe('');
      expect(preset.keywords.length, preset.id).toBeGreaterThan(0);
    }
  });

  it('hold values that fit their ports and never mix a colour with a white', () => {
    for (const preset of LIGHT_SET_PRESETS) {
      const { power, brightness, colorTemperature, color } = preset.ports;
      if (power !== undefined) expect(powerIds).toContain(power);
      if (brightness !== undefined) {
        expect(brightness).toBeGreaterThanOrEqual(LIGHT_BRIGHTNESS_RANGE.min);
        expect(brightness).toBeLessThanOrEqual(LIGHT_BRIGHTNESS_RANGE.max);
      }
      if (colorTemperature !== undefined) expect(Number(colorTemperature)).toBeGreaterThan(0);
      expect(colorTemperature !== undefined && color !== undefined, preset.id).toBe(false);
    }
  });

  it('offer on, off, warm and cool white, dim and full', () => {
    expect(LIGHT_SET_PRESETS.map((preset) => preset.id)).toEqual([
      'light.set.on',
      'light.set.off',
      'light.set.warm_white',
      'light.set.cool_white',
      'light.set.dim',
      'light.set.full',
    ]);
    const warm = LIGHT_SET_PRESETS.find((preset) => preset.id === 'light.set.warm_white');
    const cool = LIGHT_SET_PRESETS.find((preset) => preset.id === 'light.set.cool_white');
    expect(Number(warm?.ports['colorTemperature'])).toBeLessThan(
      Number(cool?.ports['colorTemperature']),
    );
  });
});
