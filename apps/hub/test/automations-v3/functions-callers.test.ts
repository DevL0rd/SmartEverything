import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { ApiError, STARTER_NODES, type FunctionV3, type FunctionV4 } from '@smarteverything/domain';
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
import { graphFunction } from './support/graph-of';

let rig: ProgramRig;
let service: AutomationFunctions;

beforeEach(() => {
  captureLogs();
  rig = programRig();
  service = automationFunctions(rig.env);
});

afterEach(() => {
  rig.close();
});

function functionOf(extra: Partial<FunctionV3> = {}): FunctionV4 {
  return graphFunction(
    {
      version: 3,
      kind: 'function',
      flavour: 'action',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      body: { nodes: [logLine('say', 'hi')] },
      ...extra,
    },
    STATIC_KIND_LOOKUP,
  );
}

function inputOf(name: string, required = true): FunctionV3['inputs'][number] {
  return { name, type: { t: 'text' }, required };
}

async function refusalOf(work: Promise<unknown>): Promise<ApiError> {
  try {
    await work;
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('The call was not refused.');
}

async function made(definition: FunctionV4): Promise<string> {
  const result = await service.create(rig.owner.caller, { name: 'Greeting', definition });
  if (result.id === null) throw new Error(`creating failed: ${result.summary}`);
  return result.id;
}

let users = 0;

async function usedBy(functionId: string, ports: Record<string, { lit: string }>): Promise<string> {
  users += 1;
  const definition = automationOf([step('use', 'fn.call', { fn: lit(functionId), ...ports })]);
  const result = await rig.service.create(rig.owner.caller, {
    name: `User ${String(users)}`,
    enabled: true,
    definition,
  });
  if (result.id === null) throw new Error(`creating failed: ${result.summary}`);
  return result.id;
}

async function breaking(
  id: string,
  definition: FunctionV4,
  expectedRevision: number,
): Promise<void> {
  const result = await service.save(rig.owner.caller, id, {
    definition,
    expectedRevision,
    confirmBreaking: true,
  });
  expect(result).toMatchObject({ ok: true, compat: 'breaking' });
}

function callPorts(automationId: string): Record<string, unknown> {
  const call = rig.programs
    .byId(automationId)
    .definition.nodes.find((node) => node.kind === 'fn.call');
  return call?.ports ?? {};
}

describe('updating callers after a breaking change', () => {
  it('maps a renamed input onto every caller as a new revision in one change', async () => {
    const id = await made(functionOf({ inputs: [inputOf('note')] }));
    const first = await usedBy(id, { note: { lit: 'a' } });
    const second = await usedBy(id, { note: { lit: 'b' } });
    await breaking(id, functionOf({ inputs: [inputOf('text')] }), 1);
    const result = await service.updateCallers(rig.owner.caller, id, { inputs: { note: 'text' } });
    expect(result.problems).toStrictEqual([]);
    expect(result.ok).toBe(true);
    expect(result.updated.map((entry) => entry.revision)).toStrictEqual([2, 2]);
    expect(callPorts(first)).toMatchObject({ text: { lit: 'a' } });
    expect(callPorts(second)).toMatchObject({ text: { lit: 'b' } });
    expect(callPorts(first)).not.toHaveProperty('note');
    expect(rig.programs.byId(first).revision).toBe(2);
  });

  it('supplies a value for a new required input', async () => {
    const id = await made(functionOf());
    const user = await usedBy(id, {});
    await breaking(id, functionOf({ inputs: [inputOf('note')] }), 1);
    const result = await service.updateCallers(rig.owner.caller, id, {
      inputValues: { note: { lit: 'hello' } },
    });
    expect(result.problems).toStrictEqual([]);
    expect(result.ok).toBe(true);
    expect(callPorts(user)).toMatchObject({ note: { lit: 'hello' } });
  });

  it('saves nothing when a caller still needs something the mapping does not give', async () => {
    const id = await made(functionOf());
    const user = await usedBy(id, {});
    await breaking(id, functionOf({ inputs: [inputOf('note')] }), 1);
    const result = await service.updateCallers(rig.owner.caller, id, {});
    expect(result.ok).toBe(false);
    expect(result.updated).toStrictEqual([]);
    expect(rig.programs.byId(user).revision).toBe(1);
  });

  it('leaves a caller pinned to a revision alone', async () => {
    const id = await made(functionOf());
    const definition = automationOf([step('use', 'fn.call', { fn: lit(id), pin: lit(1) })]);
    const saved = await rig.service.create(rig.owner.caller, {
      name: 'Pinned',
      enabled: true,
      definition,
    });
    await breaking(id, functionOf({ inputs: [inputOf('note')] }), 1);
    const result = await service.updateCallers(rig.owner.caller, id, {});
    expect(result).toMatchObject({ ok: true, updated: [] });
    expect(rig.programs.byId(saved.id ?? '').revision).toBe(1);
  });
});

async function threeSteps(
  caller: Caller = rig.owner.caller,
): Promise<{ id: string; revision: number }> {
  const definition = automationOf([
    logLine('one', 'a'),
    logLine('two', 'b'),
    logLine('three', 'c'),
  ]);
  const result = await rig.service.create(caller, { name: 'Steps', enabled: true, definition });
  if (result.id === null || result.revision === null) throw new Error(result.summary);
  return { id: result.id, revision: result.revision };
}

describe('extracting steps into a reusable node', () => {
  it('writes revision 1 of the node and the next revision of the automation together', async () => {
    const { id, revision } = await threeSteps();
    const result = await service.extract(rig.owner.caller, {
      automationId: id,
      expectedRevision: revision,
      keys: ['two'],
      name: 'Middle',
    });
    expect(result).toMatchObject({ ok: true, revision: 1, callerRevision: 2, automationId: id });
    const row = rig.functions.byId(result.id ?? '');
    expect(row.name).toBe('Middle');
    expect(row.created_by).toBe(rig.owner.profileId);
    const { nodes } = rig.programs.byId(id).definition;
    const steps = nodes.filter((node) => node.kind !== 'flow.start');
    expect(steps.map((node) => node.kind).sort()).toStrictEqual([
      'debug.log',
      'debug.log',
      'fn.call',
    ]);
    const call = steps.find((node) => node.kind === 'fn.call');
    expect(call?.ports).toMatchObject({ fn: { lit: row.id } });
    expect(result.instanceKey).toBe(call?.key);
    expect(rig.programs.byId(id).layout.nodes[call?.id ?? '']).toBeDefined();
    const first = rig.revisions.byRevision(id, 1).definition.nodes;
    expect(first.filter((node) => node.kind === 'debug.log')).toHaveLength(3);
  });

  it('applies label edits to the ports of the new node and refuses unknown ports', async () => {
    const { id, revision } = await threeSteps();
    const request = { automationId: id, expectedRevision: revision, keys: ['two'], name: 'Middle' };
    const unknown = await refusalOf(
      service.extract(rig.owner.caller, { ...request, inputs: [{ name: 'nope', label: 'x' }] }),
    );
    expect(unknown.code).toBe('invalid_request');
    expect(rig.functions.list()).toHaveLength(STARTER_NODES.length);
    expect(rig.programs.byId(id).revision).toBe(revision);
  });

  it('refuses a selection that is not one run of steps and changes nothing', async () => {
    const { id, revision } = await threeSteps();
    const result = await service.extract(rig.owner.caller, {
      automationId: id,
      expectedRevision: revision,
      keys: ['one', 'three'],
      name: 'Gap',
    });
    expect(result.ok).toBe(false);
    expect(result.problems[0]?.code).toBe('disconnected');
    expect(result.problems[0]?.message.length).toBeGreaterThan(0);
    expect(rig.functions.list()).toHaveLength(STARTER_NODES.length);
    expect(rig.programs.byId(id).revision).toBe(revision);
  });

  it('refuses when the automation moved on since it was read', async () => {
    const { id, revision } = await threeSteps();
    const stale = await refusalOf(
      service.extract(rig.owner.caller, {
        automationId: id,
        expectedRevision: revision + 1,
        keys: ['two'],
        name: 'Middle',
      }),
    );
    expect(stale.code).toBe('conflict');
  });

  it('keeps a member from moving the AI into a reusable node and creates nothing', async () => {
    const definition = automationOf([
      logLine('one', 'a'),
      step('wake', 'ai.wake', { instruction: lit('look') }),
    ]);
    const saved = await rig.service.create(rig.owner.caller, {
      name: 'Wake',
      enabled: true,
      definition,
    });
    const refused = await refusalOf(
      service.extract(rig.member.caller, {
        automationId: saved.id ?? '',
        expectedRevision: 1,
        keys: ['wake'],
        name: 'Wake node',
      }),
    );
    expect(refused.code).toBe('forbidden');
    expect(rig.functions.list()).toHaveLength(STARTER_NODES.length);
    expect(rig.programs.byId(saved.id ?? '').revision).toBe(1);
  });

  it('keeps a member from updating callers of a node or caller nodes they did not make', async () => {
    const id = await made(functionOf({ inputs: [inputOf('note', false)] }));
    await usedBy(id, {});
    const member: Caller = {
      kind: 'client',
      client: rig.member.client,
      profileId: rig.store.profiles.create({ name: 'Robin' }).id,
    };
    const own = await refusalOf(service.updateCallers(member, id, { inputs: { note: 'text' } }));
    expect(own.code).toBe('forbidden');
    expect(rig.functions.latest(id).revision).toBe(1);
  });
});
