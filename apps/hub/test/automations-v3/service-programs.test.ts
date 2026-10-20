import { randomUUID } from 'node:crypto';
import { ApiError, type AutomationProgramReply } from '@smarteverything/domain';
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

function created(
  name: string,
  definition = automationOf([logLine('say', 'hi')]),
): { readonly id: string; readonly result: AutomationProgramReply } {
  const result = rig.service.create(rig.owner.caller, { name, enabled: true, definition });
  if (result.id === null) throw new Error(`creating ${name} failed: ${result.summary}`);
  return { id: result.id, result };
}

function refusal(work: () => unknown): ApiError {
  try {
    work();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('The call was not refused.');
}

describe('creating a program', () => {
  it('saves revision 1 with its plan and the author and reports the revision', () => {
    const { id, result } = created('Lamp');
    expect(result).toMatchObject({ ok: true, revision: 1 });
    const row = rig.programs.byId(id);
    expect(row.revision).toBe(1);
    expect(row.author).toStrictEqual({ via: 'person', profile_id: rig.owner.profileId });
    const kept = rig.revisions.byRevision(id, 1);
    expect(rig.env.plans.find(kept.plan_hash)).toBeDefined();
  });

  it('writes max 10 for queue and parallel and switches the storm budgets on', () => {
    for (const mode of ['queue', 'parallel'] as const) {
      const { id } = created(mode, automationOf([logLine('say', 'hi')], { policy: { mode } }));
      expect(rig.programs.byId(id).definition.policy).toStrictEqual({ mode, max: 10 });
      expect(rig.programs.byId(id).definition.budgets).toStrictEqual({
        startBucket: 'on',
        feedback: 'on',
        effects: 'on',
      });
    }
    const { id } = created('single');
    expect(rig.programs.byId(id).definition.policy).toStrictEqual({ mode: 'single' });
  });

  it('keeps a max and budgets the caller chose', () => {
    const { id } = created(
      'chosen',
      automationOf([logLine('say', 'hi')], {
        policy: { mode: 'queue', max: 3 },
        budgets: { feedback: 'off' },
      }),
    );
    const { definition } = rig.programs.byId(id);
    expect(definition.policy).toStrictEqual({ mode: 'queue', max: 3 });
    expect(definition.budgets).toStrictEqual({ startBucket: 'on', feedback: 'off', effects: 'on' });
  });

  it('refuses a program with errors, names them and saves nothing', () => {
    const missing = randomUUID();
    const result = rig.service.create(rig.owner.caller, {
      name: 'Broken',
      enabled: true,
      definition: automationOf([setPower('lamp', missing)]),
    });
    expect(result).toMatchObject({ ok: false, id: null, revision: null });
    expect(result.problems).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'unknown_target', key: 'lamp' }),
    );
    expect(rig.programs.list()).toHaveLength(0);
  });

  it('reports warnings without blocking the save', () => {
    const { result } = created('warned', automationOf([setPower('lamp', rig.lamp.id)]));
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/Saved revision 1\./);
  });
});

describe('replacing a program', () => {
  it('saves the next revision and keeps the layout unless a new one comes', () => {
    const { id } = created('Lamp');
    const result = rig.service.update(rig.owner.caller, id, {
      definition: automationOf([logLine('say', 'changed')]),
      expectedRevision: 1,
    });
    expect(result).toMatchObject({ ok: true, id, revision: 2 });
    expect(rig.programs.byId(id).layout).toStrictEqual(rig.programs.byId(id).layout);
    expect(rig.revisions.list(id).map((revision) => revision.revision)).toEqual([2, 1]);
  });

  it('refuses a stale expected revision', () => {
    const { id } = created('Lamp');
    const refused = refusal(() =>
      rig.service.update(rig.owner.caller, id, {
        definition: automationOf([logLine('say', 'changed')]),
        expectedRevision: 5,
      }),
    );
    expect(refused.code).toBe('conflict');
  });

  it('keeps the live revision when the new program has errors', () => {
    const { id } = created('Lamp');
    const result = rig.service.update(rig.owner.caller, id, {
      definition: automationOf([setPower('lamp', randomUUID())]),
      expectedRevision: 1,
    });
    expect(result).toMatchObject({ ok: false, id, revision: 1 });
    expect(rig.programs.byId(id).revision).toBe(1);
  });
});

describe('patching a program', () => {
  it('applies the operations as one new revision and reports the new keys', () => {
    const { id } = created('Lamp');
    const result = rig.service.patch(rig.owner.caller, id, {
      expectedRevision: 1,
      ops: [
        { op: 'add', node: { kind: 'debug.log', ports: { message: lit('two') } }, in: 'body' },
        { op: 'add', node: { kind: 'debug.log', ports: { message: lit('three') } }, in: 'body' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.revision).toBe(2);
    expect(result.created).toHaveLength(2);
    expect(rig.programs.byId(id).definition.body.nodes).toHaveLength(3);
  });

  it('changes nothing when one operation is refused and says which', () => {
    const { id } = created('Lamp');
    const result = rig.service.patch(rig.owner.caller, id, {
      expectedRevision: 1,
      ops: [
        { op: 'add', node: { kind: 'debug.log', ports: { message: lit('two') } }, in: 'body' },
        { op: 'remove', key: 'nothing' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.revision).toBe(1);
    expect(result.summary).toMatch(/operation 2/);
    expect(rig.programs.byId(id).revision).toBe(1);
    expect(rig.programs.byId(id).definition.body.nodes).toHaveLength(1);
  });

  it('refuses a result with errors and saves nothing', () => {
    const { id } = created('Lamp');
    const result = rig.service.patch(rig.owner.caller, id, {
      expectedRevision: 1,
      ops: [
        {
          op: 'add',
          node: { kind: 'device.set', ports: { target: lit({ device: randomUUID() }) } },
          in: 'body',
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.created).toEqual([]);
    expect(rig.programs.byId(id).revision).toBe(1);
  });

  it('reports what a cascading remove detached', () => {
    const reader = step('shout', 'debug.log', {
      message: lit('x'),
      data: { wire: { from: 'lamp', port: 'ok' } },
    });
    const { id } = created('Chain', automationOf([setPower('lamp', rig.lamp.id), reader]));
    const result = rig.service.patch(rig.owner.caller, id, {
      expectedRevision: 1,
      ops: [{ op: 'remove', key: 'lamp', cascade: true }],
    });
    expect(result.ok).toBe(true);
    expect(result.detached).toStrictEqual([
      expect.objectContaining({ owner: 'shout', where: 'port', port: 'data' }),
    ]);
  });

  it('refuses operations that are not valid operations', () => {
    const { id } = created('Lamp');
    const refused = refusal(() =>
      rig.service.patch(rig.owner.caller, id, { expectedRevision: 1, ops: [{ op: 'explode' }] }),
    );
    expect(refused.code).toBe('invalid_request');
  });

  it('refuses a stale expected revision', () => {
    const { id } = created('Lamp');
    const refused = refusal(() =>
      rig.service.patch(rig.owner.caller, id, {
        expectedRevision: 4,
        ops: [{ op: 'header', description: 'x' }],
      }),
    );
    expect(refused.code).toBe('conflict');
  });
});

describe('removing a program', () => {
  it('deletes the automation with its revisions', () => {
    const { id } = created('Lamp');
    rig.service.remove(id);
    expect(rig.programs.find(id)).toBeUndefined();
    expect(rig.revisions.list(id)).toEqual([]);
  });

  it('is refused while another automation runs it, in the live program or in a draft', () => {
    const { id } = created('Callee');
    const running = automationOf([step('start', 'automation.run', { automation: lit(id) })]);
    const { id: live } = created('Live caller', running);
    expect(
      refusal(() => {
        rig.service.remove(id);
      }).code,
    ).toBe('conflict');
    rig.service.remove(live);
    const { id: drafting } = created('Drafting');
    const layout = rig.programs.byId(drafting).layout;
    rig.service.saveDraft(drafting, { program: running, layout, expectedRevision: 1 });
    expect(
      refusal(() => {
        rig.service.remove(id);
      }).message,
    ).toMatch(/Drafting runs this automation/);
    rig.service.discardDraft(drafting, 1);
    rig.service.remove(id);
    expect(rig.programs.find(id)).toBeUndefined();
  });
});

describe('switching a program on and off', () => {
  it('flips the flag and leaves the program and its revision alone', () => {
    const { id } = created('Toggled');
    const before = rig.programs.byId(id);
    expect(rig.service.setEnabled(id, false)).toMatchObject({ ok: true, id, revision: 1 });
    const off = rig.programs.byId(id);
    expect(off.enabled).toBe(false);
    expect(off.definition).toStrictEqual(before.definition);
    rig.service.setEnabled(id, true);
    expect(rig.programs.byId(id).enabled).toBe(true);
  });
});
