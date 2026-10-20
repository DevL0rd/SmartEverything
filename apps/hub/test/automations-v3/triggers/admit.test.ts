import { describe, expect, it } from 'vitest';
import type { FlowNode, PortValue } from '@smarteverything/domain';
import type { NodeResult, PureEvaluator } from '@smarteverything/flow/interpret/frames';
import {
  admissionCheck,
  evaluateAdmission,
  evaluateCondition,
  leadingReads,
} from '../../../src/automations/triggers-v3/admit';
import type { AdmissionParts } from '../../../src/automations/triggers-v3/admit';
import { triggerScope, type TriggerFire } from '../../../src/automations/triggers-v3/payload';

const fire: TriggerFire = {
  automationId: 'auto',
  triggerId: 'trigger-1',
  key: 'door',
  kind: 'trigger.device',
  at: '2026-10-19T08:00:00.000Z',
  payload: { value: 21, at: '2026-10-19T08:00:00.000Z', open: true, closed: false, level: 3 },
};

const wire = (from: string, port: string): PortValue => ({ wire: { from, port } });

function step(key: string, kind: string, ports: Record<string, PortValue> = {}): FlowNode {
  return { id: `00000000-0000-4000-8000-${key.padStart(12, '0')}`, key, kind, ports };
}

const notEvaluator: PureEvaluator = {
  evaluate: (request): NodeResult => {
    const flag = request.ports.get('flag');
    if (flag?.ok !== true) return flag ?? { ok: false, class: 'Invalid', message: 'no flag' };
    return { ok: true, value: { result: flag.value !== true } };
  },
};

function withReads(nodes: readonly FlowNode[]): AdmissionParts['reads'] {
  return {
    nodes,
    port: {
      node: (request): NodeResult => ({
        ok: true,
        value: { value: request.inputs['device'] ?? null },
      }),
      variable: () => ({ ok: true, value: undefined }),
    },
    pure: (kind) => (kind === 'logic.not' ? notEvaluator : undefined),
  };
}

describe('trigger admission', () => {
  it('admits when there is no admit condition', () => {
    expect(evaluateAdmission({}, fire)).toEqual({ admitted: true });
  });

  it('reads a wired flag of the trigger payload', () => {
    expect(evaluateAdmission({ admit: wire('trigger', 'open') }, fire)).toEqual({
      admitted: true,
    });
    expect(evaluateAdmission({ admit: wire('trigger', 'closed') }, fire)).toEqual({
      admitted: false,
    });
    expect(triggerScope(fire)).toMatchObject({ trigger: { key: 'door', value: 21 } });
  });

  it('refuses with the failure when the wired value is not a boolean', () => {
    expect(evaluateAdmission({ admit: wire('trigger', 'level') }, fire)).toMatchObject({
      admitted: false,
      failure: { class: 'TypeError' },
    });
    expect(evaluateAdmission({ admit: { lit: 'yes' } }, fire)).toMatchObject({
      admitted: false,
      failure: { class: 'TypeError' },
    });
  });

  it('evaluates the leading read and calculation steps the condition is wired to', () => {
    const nodes = [
      step('door', 'device.get', { device: { lit: true } }),
      step('shut', 'logic.not', { flag: wire('door', 'value') }),
    ];
    const parts: AdmissionParts = { admit: wire('shut', 'result'), reads: withReads(nodes) };
    expect(evaluateAdmission(parts, fire)).toEqual({ admitted: false });
    expect(evaluateCondition(parts, wire('door', 'value'), fire)).toEqual({
      ok: true,
      value: true,
    });
  });

  it('fails when a calculation step has no evaluator', () => {
    const nodes = [step('odd', 'logic.compare', {})];
    const parts: AdmissionParts = { admit: wire('odd', 'result'), reads: withReads(nodes) };
    expect(evaluateAdmission(parts, fire)).toMatchObject({
      admitted: false,
      failure: { class: 'NotFound' },
    });
  });

  it('takes only the read and calculation steps at the very start of the body', () => {
    const body = [
      step('a', 'device.get'),
      step('b', 'logic.not'),
      step('c', 'device.set'),
      step('d', 'device.get'),
    ];
    expect(leadingReads(body).map((node) => node.key)).toEqual(['a', 'b']);
    expect(leadingReads(body.slice(0, 2)).map((node) => node.key)).toEqual(['a', 'b']);
  });

  it('builds the driver admit callback from the same verdicts', () => {
    expect(admissionCheck({ admit: wire('trigger', 'open') }, fire)()).toEqual({
      ok: true,
      value: true,
    });
    expect(admissionCheck({ admit: wire('trigger', 'closed') }, fire)()).toEqual({
      ok: true,
      value: false,
    });
    expect(admissionCheck({ admit: wire('trigger', 'level') }, fire)()).toMatchObject({
      ok: false,
      class: 'TypeError',
    });
  });
});
