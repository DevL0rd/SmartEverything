import { ApiError, type FunctionV3 } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  automationFunctions,
  type AutomationFunctions,
} from '../../src/automations/service-functions';
import type { Caller } from '../../src/server/auth';
import { captureLogs } from '../support/logs';
import {
  automationOf,
  lit,
  logLine,
  programRig,
  step,
  type ProgramRig,
} from './support/program-rig';

let rig: ProgramRig;
let service: AutomationFunctions;

beforeEach(() => {
  captureLogs();
  rig = programRig();
  service = automationFunctions({ ...rig.env, functions: rig.functions, builtins: [] });
});

afterEach(() => {
  rig.close();
});

function functionOf(extra: Partial<FunctionV3> = {}): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: 'action',
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [],
    body: { nodes: [logLine('say', 'hi')] },
    ...extra,
  };
}

function inputOf(name: string, required = true): FunctionV3['inputs'][number] {
  return { name, type: { t: 'text' }, required };
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

function made(definition: FunctionV3): string {
  const result = service.create(rig.owner.caller, { name: 'Greeting', definition });
  if (result.id === null) throw new Error(`creating failed: ${result.summary}`);
  return result.id;
}

let users = 0;

function usedBy(functionId: string, ports: Record<string, { lit: string }>): string {
  users += 1;
  const definition = automationOf([step('use', 'fn.call', { fn: lit(functionId), ...ports })]);
  const result = rig.service.create(rig.owner.caller, {
    name: `User ${String(users)}`,
    enabled: true,
    definition,
  });
  if (result.id === null) throw new Error(`creating failed: ${result.summary}`);
  return result.id;
}

function breaking(id: string, definition: FunctionV3, expectedRevision: number): void {
  const result = service.save(rig.owner.caller, id, {
    definition,
    expectedRevision,
    confirmBreaking: true,
  });
  expect(result).toMatchObject({ ok: true, compat: 'breaking' });
}

function callPorts(automationId: string): Record<string, unknown> {
  const call = rig.programs.byId(automationId).definition.body.nodes[0];
  return call?.ports ?? {};
}

describe('updating callers after a breaking change', () => {
  it('maps a renamed input onto every caller as a new revision in one change', () => {
    const id = made(functionOf({ inputs: [inputOf('note')] }));
    const first = usedBy(id, { note: { lit: 'a' } });
    const second = usedBy(id, { note: { lit: 'b' } });
    breaking(id, functionOf({ inputs: [inputOf('text')] }), 1);
    const result = service.updateCallers(rig.owner.caller, id, { inputs: { note: 'text' } });
    expect(result.problems).toStrictEqual([]);
    expect(result.ok).toBe(true);
    expect(result.updated.map((entry) => entry.revision)).toStrictEqual([2, 2]);
    expect(callPorts(first)).toMatchObject({ text: { lit: 'a' } });
    expect(callPorts(second)).toMatchObject({ text: { lit: 'b' } });
    expect(callPorts(first)).not.toHaveProperty('note');
    expect(rig.programs.byId(first).revision).toBe(2);
  });

  it('supplies a value for a new required input', () => {
    const id = made(functionOf());
    const user = usedBy(id, {});
    breaking(id, functionOf({ inputs: [inputOf('note')] }), 1);
    const result = service.updateCallers(rig.owner.caller, id, {
      inputValues: { note: { lit: 'hello' } },
    });
    expect(result.problems).toStrictEqual([]);
    expect(result.ok).toBe(true);
    expect(callPorts(user)).toMatchObject({ note: { lit: 'hello' } });
  });

  it('saves nothing when a caller still needs something the mapping does not give', () => {
    const id = made(functionOf());
    const user = usedBy(id, {});
    breaking(id, functionOf({ inputs: [inputOf('note')] }), 1);
    const result = service.updateCallers(rig.owner.caller, id, {});
    expect(result.ok).toBe(false);
    expect(result.updated).toStrictEqual([]);
    expect(rig.programs.byId(user).revision).toBe(1);
  });

  it('leaves a caller pinned to a revision alone', () => {
    const id = made(functionOf());
    const definition = automationOf([step('use', 'fn.call', { fn: lit(id), pin: lit(1) })]);
    const saved = rig.service.create(rig.owner.caller, {
      name: 'Pinned',
      enabled: true,
      definition,
    });
    breaking(id, functionOf({ inputs: [inputOf('note')] }), 1);
    const result = service.updateCallers(rig.owner.caller, id, {});
    expect(result).toMatchObject({ ok: true, updated: [] });
    expect(rig.programs.byId(saved.id ?? '').revision).toBe(1);
  });
});

function threeSteps(caller: Caller = rig.owner.caller): { id: string; revision: number } {
  const definition = automationOf([
    logLine('one', 'a'),
    logLine('two', 'b'),
    logLine('three', 'c'),
  ]);
  const result = rig.service.create(caller, { name: 'Steps', enabled: true, definition });
  if (result.id === null || result.revision === null) throw new Error(result.summary);
  return { id: result.id, revision: result.revision };
}

describe('extracting steps into a reusable node', () => {
  it('writes revision 1 of the node and the next revision of the automation together', () => {
    const { id, revision } = threeSteps();
    const result = service.extract(rig.owner.caller, {
      automationId: id,
      expectedRevision: revision,
      keys: ['two'],
      name: 'Middle',
    });
    expect(result).toMatchObject({ ok: true, revision: 1, callerRevision: 2, automationId: id });
    const row = rig.functions.byId(result.id ?? '');
    expect(row.name).toBe('Middle');
    expect(row.created_by).toBe(rig.owner.profileId);
    const body = rig.programs.byId(id).definition.body.nodes;
    expect(body.map((node) => node.kind)).toStrictEqual(['debug.log', 'fn.call', 'debug.log']);
    expect(body[1]?.ports).toMatchObject({ fn: { lit: row.id } });
    expect(result.instanceKey).toBe(body[1]?.key);
    expect(rig.revisions.byRevision(id, 1).definition.body.nodes).toHaveLength(3);
  });

  it('applies label edits to the ports of the new node and refuses unknown ports', () => {
    const { id, revision } = threeSteps();
    const request = { automationId: id, expectedRevision: revision, keys: ['two'], name: 'Middle' };
    const unknown = refusal(() =>
      service.extract(rig.owner.caller, { ...request, inputs: [{ name: 'nope', label: 'x' }] }),
    );
    expect(unknown.code).toBe('invalid_request');
    expect(rig.functions.list()).toHaveLength(0);
    expect(rig.programs.byId(id).revision).toBe(revision);
  });

  it('refuses a selection that is not one run of steps and changes nothing', () => {
    const { id, revision } = threeSteps();
    const result = service.extract(rig.owner.caller, {
      automationId: id,
      expectedRevision: revision,
      keys: ['one', 'three'],
      name: 'Gap',
    });
    expect(result.ok).toBe(false);
    expect(result.problems[0]?.code).toBe('scattered');
    expect(result.suggestion.length).toBeGreaterThan(0);
    expect(rig.functions.list()).toHaveLength(0);
    expect(rig.programs.byId(id).revision).toBe(revision);
  });

  it('refuses when the automation moved on since it was read', () => {
    const { id, revision } = threeSteps();
    const stale = refusal(() =>
      service.extract(rig.owner.caller, {
        automationId: id,
        expectedRevision: revision + 1,
        keys: ['two'],
        name: 'Middle',
      }),
    );
    expect(stale.code).toBe('conflict');
  });

  it('keeps a member from moving the AI into a reusable node and creates nothing', () => {
    const definition = automationOf([
      logLine('one', 'a'),
      step('wake', 'ai.wake', { instruction: lit('look') }),
    ]);
    const saved = rig.service.create(rig.owner.caller, { name: 'Wake', enabled: true, definition });
    const refused = refusal(() =>
      service.extract(rig.member.caller, {
        automationId: saved.id ?? '',
        expectedRevision: 1,
        keys: ['wake'],
        name: 'Wake node',
      }),
    );
    expect(refused.code).toBe('forbidden');
    expect(rig.functions.list()).toHaveLength(0);
    expect(rig.programs.byId(saved.id ?? '').revision).toBe(1);
  });

  it('keeps a member from updating callers of a node or caller nodes they did not make', () => {
    const id = made(functionOf({ inputs: [inputOf('note', false)] }));
    usedBy(id, {});
    const member: Caller = {
      kind: 'client',
      client: rig.member.client,
      profileId: rig.store.profiles.create({ name: 'Robin' }).id,
    };
    const own = refusal(() => service.updateCallers(member, id, { inputs: { note: 'text' } }));
    expect(own.code).toBe('forbidden');
    expect(rig.functions.latest(id).revision).toBe(1);
  });
});
