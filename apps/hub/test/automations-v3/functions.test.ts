import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import {
  ApiError,
  STARTER_NODES,
  type AutomationV4,
  type FunctionV3,
  type FunctionV4,
} from '@smarteverything/domain';
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
  setPower,
  step,
  type ProgramRig,
} from './support/program-rig';
import { graphFunction } from './support/graph-of';

let rig: ProgramRig;
let service: AutomationFunctions;
let member: Caller;

beforeEach(() => {
  captureLogs();
  rig = programRig();
  member = {
    kind: 'client',
    client: rig.member.client,
    profileId: rig.store.profiles.create({ name: 'Robin' }).id,
  };
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

const REQUIRED = { name: 'note', type: { t: 'text' }, required: true } as const;
const OPTIONAL = { name: 'extra', type: { t: 'text' }, required: false } as const;

async function refusalOf(work: Promise<unknown>): Promise<ApiError> {
  try {
    await work;
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('The call was not refused.');
}

async function made(caller: Caller, name: string, definition = functionOf()): Promise<string> {
  const result = await service.create(caller, { name, definition });
  if (result.id === null) throw new Error(`creating ${name} failed: ${result.summary}`);
  return result.id;
}

async function callerOf(
  functionId: string,
  name = 'User',
): Promise<{ id: string; definition: AutomationV4 }> {
  const definition = automationOf([step('use', 'fn.call', { fn: lit(functionId) })]);
  const result = await rig.service.create(rig.owner.caller, { name, enabled: true, definition });
  if (result.id === null) throw new Error(`creating ${name} failed: ${result.summary}`);
  return { id: result.id, definition };
}

describe('listing and reading', () => {
  it('lists the interface, the revision and how many places use a reusable node', async () => {
    const id = await made(rig.owner.caller, 'Greeting', functionOf({ inputs: [OPTIONAL] }));
    expect((await service.list(member)).find((row) => row.id === id)).toMatchObject({
      name: 'Greeting',
      revision: 1,
      users: 0,
      interface: { flavour: 'action', exits: ['done'], inputs: [OPTIONAL] },
    });
    await callerOf(id);
    const row = (await service.list(rig.owner.caller)).find((entry) => entry.id === id);
    expect(row?.users).toBe(1);
    expect((await service.get(rig.owner.caller, id)).usedBy).toMatchObject([
      { kind: 'automation', name: 'User' },
    ]);
  });

  it('lists every Custom Node by name for every person', async () => {
    await made(member, 'Zed');
    await made(rig.owner.caller, 'Alpha');
    const names = ['Alpha', 'Zed', ...STARTER_NODES.map((node) => node.name)];
    expect((await service.list(member)).map((row) => row.name)).toStrictEqual(
      names.sort((left, right) => left.localeCompare(right)),
    );
  });

  it('marks a reusable node editable only for its maker and the owner', async () => {
    const id = await made(member, 'Mine');
    const other = await made(rig.owner.caller, 'Theirs');
    const editable = async (caller: Caller): Promise<Record<string, boolean>> =>
      Object.fromEntries((await service.list(caller)).map((row) => [row.id, row.editable]));
    expect(await editable(member)).toMatchObject({ [id]: true, [other]: false });
    expect(await editable(rig.owner.caller)).toMatchObject({ [id]: true, [other]: true });
  });
});

describe('saving a revision', () => {
  it('saves a compatible change as the next revision without asking', async () => {
    const id = await made(rig.owner.caller, 'Greeting');
    await callerOf(id);
    const result = await service.save(rig.owner.caller, id, {
      definition: functionOf({ inputs: [OPTIONAL] }),
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(result).toMatchObject({ ok: true, revision: 2, compat: 'compatible', affected: [] });
    expect(result.changes.map((change) => change.code)).toContain('input-added');
    expect(rig.functions.latest(id).compat).toBe('compatible');
  });

  it('refuses a breaking change until it is confirmed and names who it affects', async () => {
    const id = await made(rig.owner.caller, 'Greeting');
    await callerOf(id);
    const breaking = functionOf({ inputs: [REQUIRED] });
    const refused = await service.save(rig.owner.caller, id, {
      definition: breaking,
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(refused).toMatchObject({ ok: false, compat: 'breaking', revision: 1 });
    expect(refused.affected).toMatchObject([{ kind: 'automation', name: 'User' }]);
    expect(rig.functions.byId(id).latest_revision).toBe(1);
    const saved = await service.save(rig.owner.caller, id, {
      definition: breaking,
      expectedRevision: 1,
      confirmBreaking: true,
    });
    expect(saved).toMatchObject({ ok: true, revision: 2, compat: 'breaking' });
    expect(saved.affected).toHaveLength(1);
    expect(rig.functions.latest(id).compat).toBe('breaking');
  });

  it('refuses a stale revision and a program with errors', async () => {
    const id = await made(rig.owner.caller, 'Greeting');
    const stale = await refusalOf(
      service.save(rig.owner.caller, id, {
        definition: functionOf(),
        expectedRevision: 5,
        confirmBreaking: false,
      }),
    );
    expect(stale.code).toBe('conflict');
    const broken = functionOf({ body: { nodes: [setPower('bad', randomUUID())] } });
    const result = await service.save(rig.owner.caller, id, {
      definition: broken,
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(rig.functions.byId(id).latest_revision).toBe(1);
  });

  it('saves a Custom Node that calls itself, since recursion is allowed', async () => {
    const id = await made(rig.owner.caller, 'Loop');
    const result = await service.save(rig.owner.caller, id, {
      definition: functionOf({ body: { nodes: [step('again', 'fn.call', { fn: lit(id) })] } }),
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(result.problems.map((problem) => problem.code)).not.toContain('call_cycle');
    expect(result.ok).toBe(true);
    expect(rig.functions.byId(id).latest_revision).toBe(2);
  });

  it('renames when a name is given', async () => {
    const id = await made(rig.owner.caller, 'Old');
    await service.save(rig.owner.caller, id, {
      definition: functionOf(),
      name: 'New',
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(rig.functions.byId(id).name).toBe('New');
  });
});

describe('who may change what', () => {
  it('lets a member change only the reusable nodes they made and an owner change all', async () => {
    const mine = await made(member, 'Mine');
    const theirs = await made(rig.owner.caller, 'Theirs');
    const save = (caller: Caller, id: string): ReturnType<AutomationFunctions['save']> =>
      service.save(caller, id, {
        definition: functionOf(),
        expectedRevision: 1,
        confirmBreaking: false,
      });
    expect((await save(member, mine)).ok).toBe(true);
    expect((await refusalOf(save(member, theirs))).code).toBe('forbidden');
    expect((await save(rig.owner.caller, theirs)).ok).toBe(true);
    expect((await refusalOf(service.remove(member, theirs))).code).toBe('forbidden');
    await service.remove(member, mine);
    expect(rig.functions.find(mine)).toBeUndefined();
  });

  it('lets every person call a reusable node they did not make', async () => {
    const id = await made(rig.owner.caller, 'Shared');
    const result = await rig.service.create(member, {
      name: 'Member use',
      enabled: true,
      definition: automationOf([step('use', 'fn.call', { fn: lit(id) })]),
    });
    expect(result.ok).toBe(true);
  });

  it('keeps an owner-only body away from members', async () => {
    const wake = functionOf({
      body: { nodes: [step('wake', 'ai.wake', { instruction: lit('look') })] },
    });
    expect((await refusalOf(service.create(member, { name: 'Wake', definition: wake }))).code).toBe(
      'forbidden',
    );
    const id = await made(rig.owner.caller, 'Wake', wake);
    const program = automationOf([step('use', 'fn.call', { fn: lit(id) })]);
    expect(
      (
        await refusalOf(
          rig.service.create(member, {
            name: 'Sneak',
            enabled: true,
            definition: program,
          }),
        )
      ).code,
    ).toBe('forbidden');
  });
});

describe('deleting', () => {
  it('refuses while something uses it and allows it afterwards', async () => {
    const id = await made(rig.owner.caller, 'Greeting');
    const user = await callerOf(id);
    expect((await refusalOf(service.remove(rig.owner.caller, id))).code).toBe('conflict');
    await rig.service.remove(user.id);
    await service.remove(rig.owner.caller, id);
    expect(rig.functions.find(id)).toBeUndefined();
  });
});
