import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { callTool, structured } from '../mcp/client';
import { useRig } from '../automations/support/use-rig';

const rig = useRig();

const SAVED = z.object({ ok: z.boolean(), id: z.string(), revision: z.number() });
const EXTRACTED = z.object({ ok: z.boolean(), instanceKey: z.string() });
const FULL = z.object({
  result: z.object({
    name: z.string(),
    revision: z.number(),
    program: z.object({ nodes: z.array(z.object({ key: z.string(), kind: z.string() })) }),
  }),
});

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return structured(await callTool(rig().booted.base, await rig().mcp(), name, args));
}

async function refusal(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await callTool(rig().booted.base, await rig().mcp(), name, args);
  expect(result.isError).toBe(true);
  return JSON.stringify(result.content);
}

function step(key: string, kind: string, extra: Record<string, unknown> = {}): object {
  return { id: randomUUID(), key, kind, ...extra };
}

function levelNode(lamp: string): object {
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

function lampProgram(lamp: string): object {
  return {
    version: 4,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    policy: { mode: 'single' },
    nodes: [
      step('start', 'flow.start', { to: { next: 'study' } }),
      step('study', 'device.set', {
        ports: {
          target: { lit: { device: lamp } },
          control: { lit: 'brightness' },
          to: { lit: 20 },
        },
      }),
    ],
  };
}

async function fullOf(automationId: string): Promise<z.infer<typeof FULL>['result']> {
  return FULL.parse(await call('automation_read', { view: 'full', automationId })).result;
}

describe('names of automations and Custom Nodes through the AI tools', () => {
  it('renames an automation with only a name and keeps its revision', async () => {
    const lamp = rig().ids.lamp;
    const made = SAVED.parse(
      await call('automation_edit', {
        action: 'create',
        name: 'Old name',
        definition: lampProgram(lamp),
      }),
    );
    const renamed = await call('automation_edit', {
      action: 'update',
      automationId: made.id,
      name: 'New name',
    });
    expect(renamed).toMatchObject({ ok: true, id: made.id, revision: 1 });
    expect(await fullOf(made.id)).toMatchObject({ name: 'New name', revision: 1 });
  });

  it('refuses a name another automation uses, in plain words', async () => {
    const lamp = rig().ids.lamp;
    await call('automation_edit', {
      action: 'create',
      name: 'Taken',
      definition: lampProgram(lamp),
    });
    const other = SAVED.parse(
      await call('automation_edit', {
        action: 'create',
        name: 'Free',
        definition: lampProgram(lamp),
      }),
    );
    const onRename = await refusal('automation_edit', {
      action: 'update',
      automationId: other.id,
      name: 'Taken',
    });
    expect(onRename).toContain('An automation named \\"Taken\\" already exists');
    expect(onRename).not.toContain('StoreConflictError');
    expect(await fullOf(other.id)).toMatchObject({ name: 'Free' });
  });

  it('numbers a new automation whose name is taken instead of refusing it', async () => {
    const lamp = rig().ids.lamp;
    const create = async (): Promise<string> =>
      SAVED.parse(
        await call('automation_edit', {
          action: 'create',
          name: 'New automation',
          definition: lampProgram(lamp),
        }),
      ).id;
    const first = await create();
    const second = await create();
    const third = await create();
    expect(await fullOf(first)).toMatchObject({ name: 'New automation' });
    expect(await fullOf(second)).toMatchObject({ name: 'New automation 2' });
    expect(await fullOf(third)).toMatchObject({ name: 'New automation 3' });
  });

  it('refuses a Custom Node name already in use instead of an internal error', async () => {
    const lamp = rig().ids.lamp;
    SAVED.parse(
      await call('automation_edit', {
        action: 'create_node',
        name: 'Dimmer',
        definition: levelNode(lamp),
      }),
    );
    const refused = await refusal('automation_edit', {
      action: 'create_node',
      name: 'Dimmer',
      definition: levelNode(lamp),
    });
    expect(refused).toContain('A Custom Node named \\"Dimmer\\" already exists');
    expect(refused).not.toContain('StoreConflictError');
    expect(refused).not.toContain('internal');
  });

  it('refuses extracting into a Custom Node name already in use and changes nothing', async () => {
    const lamp = rig().ids.lamp;
    SAVED.parse(
      await call('automation_edit', {
        action: 'create_node',
        name: 'Study level',
        definition: levelNode(lamp),
      }),
    );
    const made = SAVED.parse(
      await call('automation_edit', {
        action: 'create',
        name: 'Reading',
        definition: lampProgram(lamp),
      }),
    );
    const refused = await refusal('custom_node_edit', {
      action: 'extract',
      automationId: made.id,
      keys: ['study'],
      name: 'Study level',
    });
    expect(refused).toContain('A Custom Node named \\"Study level\\" already exists');
    expect((await fullOf(made.id)).revision).toBe(1);
  });

  it('answers an extract with the key of the new call', async () => {
    const lamp = rig().ids.lamp;
    const made = SAVED.parse(
      await call('automation_edit', {
        action: 'create',
        name: 'Extracted',
        definition: lampProgram(lamp),
      }),
    );
    const extracted = EXTRACTED.parse(
      await call('custom_node_edit', {
        action: 'extract',
        automationId: made.id,
        keys: ['study'],
        name: 'Extracted level',
      }),
    );
    expect(extracted.ok).toBe(true);
    const nodes = (await fullOf(made.id)).program.nodes;
    expect(nodes.find((node) => node.key === extracted.instanceKey)?.kind).toBe('fn.call');
  });
});
