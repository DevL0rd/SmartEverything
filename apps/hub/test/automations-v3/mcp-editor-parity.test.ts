import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { callTool, structured } from '../mcp/client';
import { useRig } from '../automations/support/use-rig';

const rig = useRig();

const START = '2026-10-25T18:00:00.000Z';

const SAVED = z.object({ ok: z.boolean(), id: z.string(), revision: z.number() });
const OUTLINE = z.object({ result: z.object({ outline: z.string() }) });
const COMMANDS = z.object({
  rehearsal: z.object({
    commands: z.array(z.object({ params: z.record(z.string(), z.unknown()) })),
  }),
});
const REVISIONS = z.object({ result: z.array(z.object({ revision: z.number() })) });
const DRAFT = z.object({ result: z.object({ drafted: z.boolean(), revision: z.number() }) });
const COMPARISON = z.object({ result: z.record(z.string(), z.unknown()) });
const TEST = z.object({ id: z.string() });
const TESTS = z.object({ result: z.array(z.object({ id: z.string(), name: z.string() })) });
const TESTS_RUN = z.object({ passed: z.number(), failed: z.number() });
const EXTRACTED = z.object({ ok: z.boolean(), id: z.string() });

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return structured(await callTool(rig().booted.base, await rig().mcp(), name, args));
}

function step(key: string, kind: string, extra: Record<string, unknown> = {}): object {
  return { id: randomUUID(), key, kind, ...extra };
}

function roomLevel(lamp: string): object {
  return {
    version: 4,
    kind: 'function',
    flavour: 'action',
    inputs: [{ name: 'level', type: { t: 'number' }, required: true }],
    outputs: [],
    exits: ['done'],
    variables: [],
    nodes: [
      step('start', 'flow.start', { to: { next: 'apply' } }),
      step('apply', 'device.set', {
        ports: {
          target: { lit: { device: lamp } },
          control: { lit: 'brightness' },
          to: { wire: { from: 'inputs', port: 'level' } },
        },
      }),
    ],
  };
}

function evening(functionId: string, branchId: string): object {
  const use = (key: string, level: number): object =>
    step(key, 'fn.call', { ports: { fn: { lit: functionId }, level: { lit: level } } });
  return {
    version: 4,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    policy: { mode: 'single' },
    nodes: [
      step('start', 'flow.start', { to: { next: 'pick' } }),
      step('pick', 'flow.if', {
        branches: [{ id: branchId, when: { lit: true }, name: 'Evening', to: 'living' }],
        to: { else: 'study' },
      }),
      use('living', 80),
      use('study', 20),
    ],
  };
}

async function outlineOf(automationId: string): Promise<string> {
  return OUTLINE.parse(await call('automation_read', { view: 'outline', automationId })).result
    .outline;
}

describe('the AI covers what a person does in the automation editor', () => {
  it('builds named branches with a Custom Node placed twice, checks and dry runs it', async () => {
    const lamp = rig().ids.lamp;
    const node = SAVED.parse(
      await call('automation_edit', {
        action: 'create_node',
        name: 'Room level',
        definition: roomLevel(lamp),
      }),
    );
    expect(node.ok).toBe(true);
    const branchId = randomUUID();
    const definition = evening(node.id, branchId);
    expect(await call('automation_edit', { action: 'check', definition })).toMatchObject({
      ok: true,
    });
    const made = SAVED.parse(
      await call('automation_edit', { action: 'create', name: 'Evening lights', definition }),
    );
    expect(await outlineOf(made.id)).toContain('evening(yes) → living');
    const renamed = SAVED.parse(
      await call('automation_edit', {
        action: 'patch',
        automationId: made.id,
        ops: [
          {
            op: 'row',
            key: 'pick',
            edit: { row: 'branch', t: 'name', id: branchId, name: 'Night' },
          },
        ],
      }),
    );
    expect(renamed.revision).toBe(2);
    expect(await outlineOf(made.id)).toContain('night(yes) → living');
    const dry = COMMANDS.parse(
      await call('automation_run', { automationId: made.id, mode: 'dry', wait: true }),
    );
    expect(dry.rehearsal.commands.map((command) => command.params['to'])).toStrictEqual([80]);
    expect(rig().sent()).toStrictEqual([]);
  });

  it('reads revisions, compares them, restores one and reads the working copy', async () => {
    const node = SAVED.parse(
      await call('automation_edit', {
        action: 'create_node',
        name: 'Room level 2',
        definition: roomLevel(rig().ids.lamp),
      }),
    );
    const branchId = randomUUID();
    const made = SAVED.parse(
      await call('automation_edit', {
        action: 'create',
        name: 'Versions',
        definition: evening(node.id, branchId),
      }),
    );
    await call('automation_edit', {
      action: 'patch',
      automationId: made.id,
      ops: [
        { op: 'row', key: 'pick', edit: { row: 'branch', t: 'name', id: branchId, name: 'Late' } },
      ],
    });
    const listed = REVISIONS.parse(
      await call('automation_read', { view: 'revisions', automationId: made.id }),
    ).result.map((row) => row.revision);
    expect(listed).toStrictEqual([2, 1]);
    const compared = COMPARISON.parse(
      await call('automation_read', { view: 'compare', automationId: made.id, from: 1, to: 2 }),
    );
    expect(JSON.stringify(compared)).toContain('pick');
    const restored = SAVED.parse(
      await call('automation_versions_edit', {
        action: 'restore',
        automationId: made.id,
        revision: 1,
      }),
    );
    expect(restored).toMatchObject({ ok: true, revision: 3 });
    expect(await outlineOf(made.id)).toContain('evening(yes) → living');
    const draft = DRAFT.parse(
      await call('automation_read', { view: 'draft', automationId: made.id }),
    ).result;
    expect(draft).toStrictEqual({ ...draft, drafted: false, revision: 3 });
  });

  it('stores and runs a test, and turns a step into a Custom Node', async () => {
    const node = SAVED.parse(
      await call('automation_edit', {
        action: 'create_node',
        name: 'Room level 3',
        definition: roomLevel(rig().ids.lamp),
      }),
    );
    const made = SAVED.parse(
      await call('automation_edit', {
        action: 'create',
        name: 'Tested',
        definition: evening(node.id, randomUUID()),
      }),
    );
    const test = TEST.parse(
      await call('automation_tests_edit', {
        action: 'create',
        automationId: made.id,
        name: 'Evening path',
        scenario: { start: START },
        expectations: [{ kind: 'status', equals: 'succeeded' }],
      }),
    );
    const listed = TESTS.parse(
      await call('automation_runs_read', { view: 'tests', automationId: made.id }),
    ).result;
    expect(listed).toStrictEqual([{ ...listed[0], id: test.id, name: 'Evening path' }]);
    expect(
      TESTS_RUN.parse(
        await call('automation_tests_edit', { action: 'run', automationId: made.id }),
      ),
    ).toMatchObject({ passed: 1, failed: 0 });
    const extracted = EXTRACTED.parse(
      await call('custom_node_edit', {
        action: 'extract',
        automationId: made.id,
        keys: ['study'],
        name: 'Study level',
      }),
    );
    expect(extracted.ok).toBe(true);
    expect(await outlineOf(made.id)).toContain('· Use Study level → then end');
    expect(rig().sent()).toStrictEqual([]);
  });
});
