import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FlowNode, PortValue } from '@smarteverything/domain';
import { captureLogs } from '../../support/logs';
import {
  automationOf,
  lit,
  logLine,
  programRig,
  step,
  trigger,
  type ProgramRig,
} from '../support/program-rig';

let rig: ProgramRig;

beforeEach(() => {
  captureLogs();
  rig = programRig();
});

afterEach(() => {
  rig.close();
});

const room = (): ReturnType<typeof step> =>
  step('room', 'device.get', { device: lit(rig.lamp.id), control: lit('temperature') });

const hot = (): FlowNode =>
  step('hotNow', 'logic.compare', {
    a: { wire: { from: 'room', port: 'value' } },
    op: lit('gt'),
    b: lit(26),
  });

const HOT: PortValue = { wire: { from: 'hotNow', port: 'result' } };

describe('checking the triggers that came after the first thirteen', () => {
  it('accepts a condition that reads the first read steps of the program', () => {
    const result = rig.service.check(rig.owner.caller, {
      definition: automationOf([room(), hot(), logLine('say', 'hot')], {
        triggers: [
          trigger('hot', 'trigger.becomes_true', {
            condition: HOT,
            hold: lit(300_000),
          }),
        ],
      }),
    });
    expect(result.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('refuses a condition that reads a step after the first action', () => {
    const result = rig.service.check(rig.owner.caller, {
      definition: automationOf([logLine('say', 'hot'), room(), hot()], {
        triggers: [trigger('hot', 'trigger.becomes_true', { condition: HOT })],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual(
      expect.objectContaining({ severity: 'error', key: 'hot' }),
    );
  });

  it('refuses a hold that is not fixed and a trigger without its condition', () => {
    const loose = rig.service.check(rig.owner.caller, {
      definition: automationOf([room(), hot()], {
        triggers: [
          trigger('hot', 'trigger.becomes_true', {
            condition: HOT,
            hold: { wire: { from: 'room', port: 'value' } },
          }),
        ],
      }),
    });
    expect(loose.problems).toContainEqual(
      expect.objectContaining({ code: 'static_not_literal', key: 'hot', port: 'hold' }),
    );
    const missing = rig.service.check(rig.owner.caller, {
      definition: automationOf([room()], { triggers: [trigger('hot', 'trigger.becomes_true')] }),
    });
    expect(missing.ok).toBe(false);
  });

  it('lets only the owner save a webhook trigger', () => {
    const definition = automationOf([logLine('say', 'hi')], {
      triggers: [trigger('hook', 'trigger.webhook', { path: lit('k3Jq9Zr2Lm8Xv5Bn7TcWd1') })],
    });
    expect(rig.service.check(rig.owner.caller, { definition }).ok).toBe(true);
    const member = rig.service.check(rig.member.caller, { definition });
    expect(member.ok).toBe(false);
    expect(member.problems).toContainEqual(expect.objectContaining({ code: 'forbidden' }));
  });

  it.each([
    ['trigger.computer', { kind: lit('app_open'), app: lit('Steam') }],
    ['trigger.phone', { kind: lit('unlocked') }],
    ['trigger.health', { kind: lit('sleep_ended') }],
    ['trigger.chat', { outcome: lit('failed') }],
    ['trigger.event', { name: lit('guest_mode_on') }],
    ['trigger.timer', { timer: lit('laundry') }],
    ['trigger.hub_started', {}],
  ])('saves a %s trigger for a member', (kind, ports) => {
    const result = rig.service.check(rig.member.caller, {
      definition: automationOf([logLine('say', 'hi')], { triggers: [trigger('t', kind, ports)] }),
    });
    expect(result.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
