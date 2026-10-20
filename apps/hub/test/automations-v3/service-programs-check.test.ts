import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import {
  automationOf,
  lit,
  logLine,
  programRig,
  setPower,
  step,
  type ProgramRig,
} from './support/program-rig';

let rig: ProgramRig;

beforeEach(() => {
  captureLogs();
  rig = programRig();
});

afterEach(() => {
  rig.close();
});

function stored(): string {
  const body = [setPower('lamp', rig.lamp.id), setPower('later', rig.lamp.id)];
  const result = rig.service.create(rig.owner.caller, {
    name: 'Lamp',
    enabled: true,
    definition: automationOf(body),
  });
  if (result.id === null) throw new Error(result.summary);
  return result.id;
}

describe('checking a whole program', () => {
  it('saves nothing and says whether the program would save', () => {
    const result = rig.service.check(rig.owner.caller, {
      definition: automationOf([logLine('say', 'hi')]),
    });
    expect(result).toMatchObject({ ok: true, id: null, revision: null });
    expect(rig.programs.list()).toHaveLength(0);
  });

  it('lists every error at once with the node, port and a suggested fix', () => {
    const result = rig.service.check(rig.owner.caller, {
      definition: automationOf([
        setPower('first', randomUUID()),
        step('second', 'debug.log', { message: { wire: { from: 'nothing', port: 'here' } } }),
      ]),
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_target', key: 'first', port: 'target' }),
        expect.objectContaining({ code: 'unknown_reference', key: 'second', port: 'message' }),
      ]),
    );
    expect(result.problems.find((found) => found.code === 'unknown_target')?.fix).toStrictEqual({
      summary: 'pick a target that exists',
    });
  });

  it('shows what the save would refuse for this person as a problem', () => {
    const wake = step('wake', 'ai.wake', { instruction: lit('look around') });
    const forMember = rig.service.check(rig.member.caller, { definition: automationOf([wake]) });
    expect(forMember.ok).toBe(false);
    expect(forMember.problems).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'forbidden' }),
    );
    const forOwner = rig.service.check(rig.owner.caller, { definition: automationOf([wake]) });
    expect(forOwner.ok).toBe(true);
  });
});

describe('previewing a patch', () => {
  it('checks the result of the operations on the stored automation and saves nothing', () => {
    const id = stored();
    const result = rig.service.check(rig.owner.caller, {
      automationId: id,
      ops: [{ op: 'remove', key: 'later' }],
    });
    expect(result).toMatchObject({ ok: true, id, revision: 1 });
    expect(rig.programs.byId(id).definition.body.nodes).toHaveLength(2);
    expect(rig.programs.byId(id).revision).toBe(1);
  });

  it('reports a refused operation as a problem', () => {
    const id = stored();
    const result = rig.service.check(rig.owner.caller, {
      automationId: id,
      ops: [{ op: 'remove', key: 'nothing' }],
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual(expect.objectContaining({ code: 'unknown_key' }));
  });

  it('reports the errors the operations would cause', () => {
    const id = stored();
    const result = rig.service.check(rig.owner.caller, {
      automationId: id,
      ops: [{ op: 'set', key: 'lamp', ports: { target: lit({ device: randomUUID() }) } }],
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual(
      expect.objectContaining({ code: 'unknown_target', key: 'lamp' }),
    );
  });
});
