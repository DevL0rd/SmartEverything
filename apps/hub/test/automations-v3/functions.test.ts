import { ApiError, type AutomationV3, type FunctionV3 } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  automationFunctions,
  type AutomationFunctions,
  type BuiltinFunction,
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
let member: Caller;

const BUILTIN: BuiltinFunction = {
  id: 'builtin.demo',
  revision: 3,
  name: 'Demo',
  program: functionOf(),
};

beforeEach(() => {
  captureLogs();
  rig = programRig();
  member = {
    kind: 'client',
    client: rig.member.client,
    profileId: rig.store.profiles.create({ name: 'Robin' }).id,
  };
  service = automationFunctions({ ...rig.env, functions: rig.functions, builtins: [BUILTIN] });
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

const REQUIRED = { name: 'note', type: { t: 'text' }, required: true } as const;
const OPTIONAL = { name: 'extra', type: { t: 'text' }, required: false } as const;

function refusal(work: () => unknown): ApiError {
  try {
    work();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('The call was not refused.');
}

function made(caller: Caller, name: string, definition = functionOf()): string {
  const result = service.create(caller, { name, definition });
  if (result.id === null) throw new Error(`creating ${name} failed: ${result.summary}`);
  return result.id;
}

function callerOf(functionId: string, name = 'User'): { id: string; definition: AutomationV3 } {
  const definition = automationOf([step('use', 'fn.call', { fn: lit(functionId) })]);
  const result = rig.service.create(rig.owner.caller, { name, enabled: true, definition });
  if (result.id === null) throw new Error(`creating ${name} failed: ${result.summary}`);
  return { id: result.id, definition };
}

describe('listing and reading', () => {
  it('lists the interface, the revision and how many places use a reusable node', () => {
    const id = made(rig.owner.caller, 'Greeting', functionOf({ inputs: [OPTIONAL] }));
    expect(service.list(member).find((row) => row.id === id)).toMatchObject({
      name: 'Greeting',
      revision: 1,
      users: 0,
      builtin: false,
      interface: { flavour: 'action', exits: ['done'], inputs: [OPTIONAL] },
    });
    callerOf(id);
    const row = service.list(rig.owner.caller).find((entry) => entry.id === id);
    expect(row?.users).toBe(1);
    expect(service.get(rig.owner.caller, id).usedBy).toMatchObject([
      { kind: 'automation', name: 'User' },
    ]);
  });

  it('lists the built-ins read only next to the custom ones, and every person sees all', () => {
    made(rig.owner.caller, 'Zed');
    const rows = service.list(member);
    expect(rows.map((row) => row.name)).toStrictEqual(['Demo', 'Zed']);
    expect(rows[0]).toMatchObject({ builtin: true, editable: false, revision: 3, createdBy: null });
    expect(service.get(member, 'builtin.demo').program.kind).toBe('function');
  });

  it('marks a reusable node editable only for its maker and the owner', () => {
    const id = made(member, 'Mine');
    const other = made(rig.owner.caller, 'Theirs');
    const editable = (caller: Caller): Record<string, boolean> =>
      Object.fromEntries(service.list(caller).map((row) => [row.id, row.editable]));
    expect(editable(member)).toMatchObject({ [id]: true, [other]: false });
    expect(editable(rig.owner.caller)).toMatchObject({ [id]: true, [other]: true });
  });
});

describe('saving a revision', () => {
  it('saves a compatible change as the next revision without asking', () => {
    const id = made(rig.owner.caller, 'Greeting');
    callerOf(id);
    const result = service.save(rig.owner.caller, id, {
      definition: functionOf({ inputs: [OPTIONAL] }),
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(result).toMatchObject({ ok: true, revision: 2, compat: 'compatible', affected: [] });
    expect(result.changes.map((change) => change.code)).toContain('input-added');
    expect(rig.functions.latest(id).compat).toBe('compatible');
  });

  it('refuses a breaking change until it is confirmed and names who it affects', () => {
    const id = made(rig.owner.caller, 'Greeting');
    callerOf(id);
    const breaking = functionOf({ inputs: [REQUIRED] });
    const refused = service.save(rig.owner.caller, id, {
      definition: breaking,
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(refused).toMatchObject({ ok: false, compat: 'breaking', revision: 1 });
    expect(refused.affected).toMatchObject([{ kind: 'automation', name: 'User' }]);
    expect(rig.functions.byId(id).latest_revision).toBe(1);
    const saved = service.save(rig.owner.caller, id, {
      definition: breaking,
      expectedRevision: 1,
      confirmBreaking: true,
    });
    expect(saved).toMatchObject({ ok: true, revision: 2, compat: 'breaking' });
    expect(saved.affected).toHaveLength(1);
    expect(rig.functions.latest(id).compat).toBe('breaking');
  });

  it('refuses a stale revision and a program with errors', () => {
    const id = made(rig.owner.caller, 'Greeting');
    const stale = refusal(() =>
      service.save(rig.owner.caller, id, {
        definition: functionOf(),
        expectedRevision: 5,
        confirmBreaking: false,
      }),
    );
    expect(stale.code).toBe('conflict');
    const broken = functionOf({ body: { nodes: [step('bad', 'no.such.kind', {})] } });
    const result = service.save(rig.owner.caller, id, {
      definition: broken,
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(rig.functions.byId(id).latest_revision).toBe(1);
  });

  it('saves a Custom Node that calls itself, since recursion is allowed', () => {
    const id = made(rig.owner.caller, 'Loop');
    const result = service.save(rig.owner.caller, id, {
      definition: functionOf({ body: { nodes: [step('again', 'fn.call', { fn: lit(id) })] } }),
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(result.problems.map((problem) => problem.code)).not.toContain('call_cycle');
    expect(result.ok).toBe(true);
    expect(rig.functions.byId(id).latest_revision).toBe(2);
  });

  it('renames when a name is given', () => {
    const id = made(rig.owner.caller, 'Old');
    service.save(rig.owner.caller, id, {
      definition: functionOf(),
      name: 'New',
      expectedRevision: 1,
      confirmBreaking: false,
    });
    expect(rig.functions.byId(id).name).toBe('New');
  });
});

describe('who may change what', () => {
  it('lets a member change only the reusable nodes they made and an owner change all', () => {
    const mine = made(member, 'Mine');
    const theirs = made(rig.owner.caller, 'Theirs');
    const save = (caller: Caller, id: string): ReturnType<AutomationFunctions['save']> =>
      service.save(caller, id, {
        definition: functionOf(),
        expectedRevision: 1,
        confirmBreaking: false,
      });
    expect(save(member, mine).ok).toBe(true);
    expect(refusal(() => save(member, theirs)).code).toBe('forbidden');
    expect(save(rig.owner.caller, theirs).ok).toBe(true);
    expect(
      refusal(() => {
        service.remove(member, theirs);
      }).code,
    ).toBe('forbidden');
    service.remove(member, mine);
    expect(rig.functions.find(mine)).toBeUndefined();
  });

  it('lets every person call a reusable node they did not make', () => {
    const id = made(rig.owner.caller, 'Shared');
    const result = rig.service.create(member, {
      name: 'Member use',
      enabled: true,
      definition: automationOf([step('use', 'fn.call', { fn: lit(id) })]),
    });
    expect(result.ok).toBe(true);
  });

  it('keeps built-ins read only and an owner-only body away from members', () => {
    expect(
      refusal(() => {
        service.remove(rig.owner.caller, 'builtin.demo');
      }).code,
    ).toBe('forbidden');
    const saved = refusal(() =>
      service.save(rig.owner.caller, 'builtin.demo', {
        definition: functionOf(),
        expectedRevision: 3,
        confirmBreaking: false,
      }),
    );
    expect(saved.code).toBe('forbidden');
    const wake = functionOf({
      body: { nodes: [step('wake', 'ai.wake', { instruction: lit('look') })] },
    });
    expect(refusal(() => service.create(member, { name: 'Wake', definition: wake })).code).toBe(
      'forbidden',
    );
    const id = made(rig.owner.caller, 'Wake', wake);
    const program = automationOf([step('use', 'fn.call', { fn: lit(id) })]);
    expect(
      refusal(() =>
        rig.service.create(member, {
          name: 'Sneak',
          enabled: true,
          definition: program,
        }),
      ).code,
    ).toBe('forbidden');
  });
});

describe('deleting', () => {
  it('refuses while something uses it and allows it afterwards', () => {
    const id = made(rig.owner.caller, 'Greeting');
    const user = callerOf(id);
    expect(
      refusal(() => {
        service.remove(rig.owner.caller, id);
      }).code,
    ).toBe('conflict');
    rig.service.remove(user.id);
    service.remove(rig.owner.caller, id);
    expect(rig.functions.find(id)).toBeUndefined();
  });
});
