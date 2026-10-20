import {
  BUILTIN_FUNCTIONS,
  FUNCTION_V3,
  STATEFUL_KIND_IDS,
  TRIGGER_KIND_PREFIX,
  builtinFunction,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { check } from '../../src/check/check';
import { hasErrors, lint } from '../../src/check/lint';
import { lower } from '../../src/compile/lower';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { indexProgram } from '../../src/program/lookup';
import { checkContext, lintContext } from './support';

const NAMES = [
  'press_cycle_brightness',
  'long_press_reset',
  'presence_lights',
  'speak_or_push',
  'appliance_notice',
  'timed_devices',
  'average_in_room',
  'weather_look',
  'lights_off_after',
  'doorbell_flash',
  'wake_up_light',
  'leave_home_check',
  'ask_then_act',
  'camera_check',
];

describe('the built-in reusable nodes', () => {
  it('are exactly the nine v1 and five v1.1 nodes, found by their ids', () => {
    expect(BUILTIN_FUNCTIONS.map((entry) => entry.id)).toEqual(
      NAMES.map((name) => `builtin.${name}`),
    );
    for (const entry of BUILTIN_FUNCTIONS) expect(builtinFunction(entry.id)).toBe(entry);
    expect(builtinFunction('builtin.threshold_pair')).toBeUndefined();
  });

  it('use unique ids, unique node ids and a positive revision', () => {
    const nodeIds = BUILTIN_FUNCTIONS.flatMap((entry) =>
      indexProgram(entry.program).nodes.map((found) => found.node.id),
    );
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    for (const entry of BUILTIN_FUNCTIONS) expect(entry.revision).toBeGreaterThanOrEqual(1);
  });

  describe.each(BUILTIN_FUNCTIONS)('$id', ({ program }) => {
    it('parses as a function and checks without problems', () => {
      expect(FUNCTION_V3.safeParse(program).success).toBe(true);
      expect(check(program, checkContext())).toEqual([]);
    });

    it('holds no trigger, persistent variable or stateful node and no read in a function', () => {
      const findings = lint(program, lintContext());
      expect(hasErrors(findings)).toBe(false);
      expect(program.variables.filter((variable) => variable.persist === true)).toEqual([]);
      for (const { node } of indexProgram(program).nodes) {
        expect(node.kind.startsWith(TRIGGER_KIND_PREFIX)).toBe(false);
        expect(STATEFUL_KIND_IDS.has(node.kind)).toBe(false);
      }
    });

    it('compiles into a plan', () => {
      expect(lower(program, { kinds: (kind) => NODE_REGISTRY.get(kind) }).ok).toBe(true);
    });
  });

  it('keeps reads out of Functions: every built-in is an Action', () => {
    for (const entry of BUILTIN_FUNCTIONS) expect(entry.program.flavour).toBe('action');
  });
});
