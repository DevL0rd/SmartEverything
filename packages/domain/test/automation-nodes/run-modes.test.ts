import { describe, expect, it } from 'vitest';
import { NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import { ERROR_VALUE, errorValueOf } from '../../src/automation-nodes/error-port';
import { hasModeChoice, modesOf, runModeOf } from '../../src/automation-nodes/run-modes';

describe('run modes', () => {
  it('lets plain commands send by default and choose to wait', () => {
    for (const id of [
      'device.set',
      'device.toggle',
      'device.fade',
      'device.restore',
      'scene.run',
      'notify.person',
      'notify.feed',
      'notify.speak',
      'computer.power',
      'phone.action',
      'device.ir_send',
    ]) {
      const kind = NODE_REGISTRY.get(id);
      expect(modesOf(kind), id).toEqual({
        default: 'fire_and_forget',
        allowed: ['fire_and_forget', 'wait_for_result'],
      });
      expect(hasModeChoice(kind), id).toBe(true);
      expect(runModeOf(kind, undefined), id).toBe('fire_and_forget');
      expect(runModeOf(kind, 'wait_for_result'), id).toBe('wait_for_result');
    }
  });

  it('makes reads and questions always wait and ignore a chosen mode', () => {
    for (const id of ['device.snapshot', 'notify.ask', 'ai.ask', 'http.request', 'tool.call']) {
      const kind = NODE_REGISTRY.get(id);
      expect(modesOf(kind), id).toEqual({
        default: 'wait_for_result',
        allowed: ['wait_for_result'],
      });
      expect(hasModeChoice(kind), id).toBe(false);
      expect(runModeOf(kind, 'fire_and_forget'), id).toBe('wait_for_result');
    }
    expect(runModeOf(undefined, 'fire_and_forget')).toBe('wait_for_result');
  });

  it('takes a declared modes override', () => {
    const kind = {
      effect: { retry: 'external', budget: 'effects' },
      modes: { default: 'wait_for_result', allowed: ['wait_for_result', 'fire_and_forget'] },
    } as const;
    expect(modesOf(kind)).toBe(kind.modes);
    expect(runModeOf(kind, undefined)).toBe('wait_for_result');
    expect(runModeOf(kind, 'fire_and_forget')).toBe('fire_and_forget');
  });
});

describe('the error value', () => {
  it('has a reason, a message and an optional code', () => {
    expect(errorValueOf('Timeout', 'no answer')).toEqual({
      reason: 'Timeout',
      message: 'no answer',
    });
    expect(errorValueOf('Refused', 'busy', 'E42')).toEqual({
      reason: 'Refused',
      message: 'busy',
      code: 'E42',
    });
    expect(ERROR_VALUE.safeParse({ reason: 'Failed', message: 'x', extra: 1 }).success).toBe(true);
    expect(ERROR_VALUE.safeParse({ reason: 'Oops', message: 'x' }).success).toBe(false);
  });
});
