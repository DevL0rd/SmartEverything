import { ALL_NODE_KINDS, API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { callTool, resultOf, rpc, structured } from '../mcp/client';
import { useRig } from '../automations/support/use-rig';
import { node, programOf, trigger } from '../support/automation-fixture';

const rig = useRig();

const NOW = '2026-10-19T08:00:00.000Z';

const STARTED = z.object({ ok: z.boolean(), id: z.string(), status: z.string() });
const REHEARSED = z.object({ ok: z.boolean(), status: z.literal('rehearsed') });
const COMMANDS = z.object({
  rehearsal: z.object({
    commands: z.array(z.object({ params: z.record(z.string(), z.unknown()) })),
  }),
});
const RUN = z.object({ result: z.object({ run: z.object({ status: z.string() }) }) });
const RUN_LIST = z.object({ result: z.array(z.object({ id: z.string(), status: z.string() })) });
const VALUE = z.object({ id: z.string(), revision: z.number() });
const CREATED = z.object({ ok: z.boolean(), id: z.string(), revision: z.number() });
const CATALOG = z.object({ result: z.object({ nodes: z.array(z.object({ kind: z.string() })) }) });

const TOOLS = z.array(
  z.object({
    name: z.string(),
    annotations: z.object({ readOnlyHint: z.boolean(), destructiveHint: z.boolean() }),
  }),
);

type Kind = 'read' | 'write' | 'destructive';

const AUTOMATION_TOOLS: Readonly<Record<string, Kind>> = {
  automation_read: 'read',
  automation_edit: 'destructive',
  automation_run: 'write',
  automation_runs_read: 'read',
  automation_stop: 'write',
  value_read: 'read',
  value_edit: 'destructive',
  scene_find: 'read',
  scene_edit: 'destructive',
  scene_run: 'destructive',
  schedule_find: 'read',
  schedule_edit: 'destructive',
};

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return structured(await callTool(rig().booted.base, await rig().mcp(), name, args));
}

function turnOn(): ReturnType<typeof programOf> {
  return programOf(
    [],
    [node('device.set', { target: { device: rig().ids.lamp }, control: 'power', to: true })],
  );
}

async function stored(): Promise<readonly { readonly id: string; readonly name: string }[]> {
  return (await rig().request(API_ENDPOINTS.readSnapshot)).tables.automations;
}

async function create(name: string, definition = turnOn()): Promise<string> {
  return CREATED.parse(await call('automation_edit', { action: 'create', name, definition })).id;
}

describe('MCP parity for automations', () => {
  it('offers a tool for every automation capability with the right read, write and destructive marking', async () => {
    const result = await resultOf(
      await rpc(
        rig().booted.base,
        await rig().mcp(),
        { method: 'tools/list' },
        { 'user-agent': 'claude-code/2.1' },
      ),
    );
    const tools = new Map(TOOLS.parse(result['tools']).map((tool) => [tool.name, tool]));
    const kinds = Object.keys(AUTOMATION_TOOLS).map((name) => {
      const hints = tools.get(name)?.annotations;
      if (hints === undefined) return [name, 'missing'];
      if (hints.readOnlyHint) return [name, 'read'];
      return [name, hints.destructiveHint ? 'destructive' : 'write'];
    });
    expect(kinds).toStrictEqual(Object.entries(AUTOMATION_TOOLS));
  });

  it('creates, lists, runs and removes an automation through the same hub handlers', async () => {
    const created = CREATED.parse(
      await call('automation_edit', { action: 'create', name: 'By AI', definition: turnOn() }),
    );
    expect(created).toMatchObject({ ok: true, revision: 1 });
    expect((await stored()).map((row) => row.name)).toStrictEqual(['By AI']);
    expect(JSON.stringify(await call('automation_read', { view: 'summary' }))).toContain('By AI');
    const ran = STARTED.parse(
      await call('automation_run', { automationId: created.id, wait: true }),
    );
    expect(ran).toMatchObject({ ok: true, status: 'finished' });
    const [run] = RUN_LIST.parse(await call('automation_runs_read', { view: 'list' })).result;
    expect(run).toMatchObject({ id: ran.id, status: 'succeeded' });
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
    await call('automation_edit', { action: 'remove', automationId: created.id });
    expect(await stored()).toHaveLength(0);
  });

  it('checks a program without saving it and refuses an unknown node kind', async () => {
    const good = await call('automation_edit', { action: 'check', body: { definition: turnOn() } });
    expect(good).toMatchObject({ ok: true });
    const bad = await call('automation_edit', {
      action: 'check',
      body: { definition: programOf([], [node('no.such.kind')]) },
    });
    expect(bad).toMatchObject({ ok: false });
    expect(await stored()).toHaveLength(0);
  });

  it('reads the node catalog before a program is written', async () => {
    const catalog = CATALOG.parse(await call('automation_read', { view: 'catalog' }));
    const kinds = catalog.result.nodes.map((entry) => entry.kind);
    expect(kinds).toContain('device.set');
    expect(kinds).toContain('flow.wait');
    const later = ALL_NODE_KINDS.filter((kind) => kind.tier === 'v1.1');
    expect(later.length).toBeGreaterThan(0);
    for (const kind of later) expect(kinds).toContain(kind.id);
  });

  it('dry runs record the commands without sending them', async () => {
    const id = await create('Dry');
    const ran = REHEARSED.parse(
      await call('automation_run', { automationId: id, mode: 'dry', wait: true }),
    );
    expect(ran.ok).toBe(true);
    expect(rig().sent()).toStrictEqual([]);
  });

  it('dry runs start as a chosen trigger with its signal', async () => {
    const lamp = rig().ids.lamp;
    const button = trigger('trigger.button', { device: lamp, press: 'long_press' });
    const change = trigger('trigger.device', { device: lamp, control: 'power' });
    const chosen = node('logic.compare', { op: 'eq', b: button.key });
    const held = node('device.set', { target: { device: lamp }, control: 'power' });
    const program = programOf(
      [button, change],
      [
        { ...chosen, ports: { ...chosen.ports, a: { wire: { from: 'trigger', port: 'key' } } } },
        {
          ...held,
          ports: { ...held.ports, to: { wire: { from: chosen.key, port: 'result' } } },
        },
      ],
    );
    const id = await create('Chosen trigger', program);
    const signal = {
      source: 'event',
      kind: 'button',
      subject: lamp,
      field: null,
      value: 'long_press',
      previous: null,
      profileId: null,
      data: { action: 'long_press' },
    };
    const sentTo = async (extra: Record<string, unknown>): Promise<unknown> =>
      COMMANDS.parse(
        await call('automation_run', { automationId: id, mode: 'dry', wait: true, ...extra }),
      ).rehearsal.commands[0]?.params['to'];
    expect(await sentTo({ trigger: { key: button.key, signal } })).toBe(true);
    expect(await sentTo({ trigger: { key: change.key } })).toBe(false);
    expect(await sentTo({})).toBe(false);
    const wrong = await callTool(rig().booted.base, await rig().mcp(), 'automation_run', {
      automationId: id,
      mode: 'dry',
      trigger: { key: 'nope' },
    });
    expect(wrong.isError).toBe(true);
    expect(JSON.stringify(wrong.content)).toContain('There is no trigger');
    expect(rig().sent()).toStrictEqual([]);
  });

  it('dry runs and simulations tell a Which trigger node the trigger that fired', async () => {
    const lamp = rig().ids.lamp;
    const button = trigger('trigger.button', { device: lamp, press: 'long_press' });
    const change = trigger('trigger.device', { device: lamp, control: 'power' });
    const which = node('logic.trigger_is', { source: button.key });
    const held = node('device.set', { target: { device: lamp }, control: 'power' });
    const program = programOf(
      [button, change],
      [
        which,
        { ...held, ports: { ...held.ports, to: { wire: { from: which.key, port: 'result' } } } },
      ],
    );
    const id = await create('Which trigger', program);
    const modes = [{ mode: 'dry' }, { mode: 'simulate', scenario: { start: NOW } }];
    const sentTo = async (mode: object, key: string): Promise<unknown> =>
      COMMANDS.parse(
        await call('automation_run', { automationId: id, ...mode, wait: true, trigger: { key } }),
      ).rehearsal.commands[0]?.params['to'];
    for (const mode of modes) {
      expect(await sentTo(mode, button.key)).toBe(true);
      expect(await sentTo(mode, change.key)).toBe(false);
    }
    expect(rig().sent()).toStrictEqual([]);
  });

  it('starts a run that can be read and stopped', async () => {
    const id = await create('Slow', programOf([], [node('flow.wait', { duration: 600_000 })]));
    const { id: runId } = STARTED.parse(await call('automation_run', { automationId: id }));
    const statusOf = async (): Promise<string> =>
      RUN.parse(await call('automation_runs_read', { view: 'run', runId })).result.run.status;
    await rig().until(async () => ['running', 'waiting'].includes(await statusOf()));
    await call('automation_stop', { action: 'automation', automationId: id });
    await rig().until(async () => (await statusOf()) === 'cancelled');
  });

  it('creates a Value and applies an operation to it', async () => {
    const created = await call('value_edit', {
      action: 'create',
      content: { kind: 'number', name: 'Level', value: 4, bounds: { overflow: 'reject' } },
    });
    const valueId = VALUE.parse(created).id;
    await call('value_edit', {
      action: 'apply',
      valueId,
      body: { kind: 'number', operation: { type: 'add', value: 3 } },
    });
    const [value] = await rig().request(API_ENDPOINTS.listAutomationValues);
    expect(value?.content).toMatchObject({ value: 7 });
  });

  it('schedules a one-off action through the same scheduler as the app', async () => {
    await call('schedule_edit', {
      action: 'create',
      timing: { kind: 'in', seconds: 30 },
      steps: [
        {
          kind: 'tool',
          tool: 'device_control',
          args: {
            deviceIds: [rig().ids.lamp],
            capability: 'power',
            value: true,
          },
        },
      ],
    });
    const rows = await rig().request(API_ENDPOINTS.listSchedules);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.via).toBe('assistant');
  });
});
