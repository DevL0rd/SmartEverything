import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { callTool, resultOf, rpc, structured } from '../mcp/client';
import { createAutomation, definitionOf, setPower } from './support/programs';
import { startAndFinish } from './support/runs';
import { useRig } from './support/use-rig';

const rig = useRig();

const RUN = z.object({ result: z.object({ id: z.string(), status: z.string() }) });
const STARTED = z.object({ id: z.string(), status: z.string() });
const VALUE = z.object({ id: z.string(), revision: z.number() });

const TOOLS = z.array(
  z.object({
    name: z.string(),
    annotations: z.object({ readOnlyHint: z.boolean(), destructiveHint: z.boolean() }),
  }),
);

type Kind = 'read' | 'write' | 'destructive';

const AUTOMATION_TOOLS: Readonly<Record<string, Kind>> = {
  list_automations: 'read',
  edit_automation: 'write',
  run_automation: 'write',
  read_automation_runs: 'read',
  stop_automation: 'write',
  list_values: 'read',
  edit_value: 'write',
  list_scenes: 'read',
  edit_scene: 'write',
  run_scene: 'destructive',
  list_scheduled: 'read',
  edit_schedule: 'write',
};

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return structured(await callTool(rig().booted.base, await rig().mcp(), name, args));
}

describe('C33 MCP parity for automations', () => {
  it('offers a tool for every automation capability with the right read, write and destructive marking', async () => {
    const result = await resultOf(
      await rpc(rig().booted.base, await rig().mcp(), { method: 'tools/list' }),
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
    const created = await call('edit_automation', {
      action: 'create',
      name: 'By AI',
      definition: definitionOf({ actions: [setPower(rig().ids.lamp, true)] }),
    });
    const [listed] = await rig().request(API_ENDPOINTS.listAutomations);
    expect(listed?.name).toBe('By AI');
    expect(JSON.stringify(created)).toContain('By AI');
    await call('run_automation', { automationId: listed?.id, wait: true });
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
    await call('edit_automation', { action: 'remove', automationId: listed?.id });
    expect(await rig().request(API_ENDPOINTS.listAutomations)).toHaveLength(0);
  });

  it('answers an automation edit with its id and the revision a guarded save needs, not the definition', async () => {
    const created = await call('edit_automation', {
      action: 'create',
      name: 'Compact',
      definition: definitionOf({ actions: [setPower(rig().ids.lamp, true)] }),
    });
    const [row] = await rig().request(API_ENDPOINTS.listAutomations);
    expect(created).toStrictEqual({
      ok: true,
      summary: 'Created automation “Compact”',
      id: row?.id,
      revision: 1,
      enabled: true,
    });
    expect(JSON.stringify(created).length * 2).toBeLessThan(JSON.stringify(row).length);
  });

  it('starts a run that can be read and stopped', async () => {
    const row = await createAutomation(rig(), 'Slow', {
      actions: [{ type: 'delay', seconds: 600 }, setPower(rig().ids.lamp, true)],
    });
    const started = await call('run_automation', { automationId: row.id });
    const runId = STARTED.parse(started).id;
    const statusOf = async (): Promise<string> =>
      RUN.parse(await call('read_automation_runs', { view: 'run', runId })).result.status;
    await rig().until(async () => (await statusOf()) === 'running');
    await call('stop_automation', { action: 'automation', automationId: row.id });
    await rig().until(async () => (await statusOf()) === 'cancelled');
  });

  it('creates a Value and applies an operation to it', async () => {
    const created = await call('edit_value', {
      action: 'create',
      content: { kind: 'number', name: 'Level', value: 4, bounds: { overflow: 'reject' } },
    });
    const valueId = VALUE.parse(created).id;
    await call('edit_value', {
      action: 'apply',
      valueId,
      body: { kind: 'number', operation: { type: 'add', value: 3 } },
    });
    const [value] = await rig().request(API_ENDPOINTS.listAutomationValues);
    expect(value?.content).toMatchObject({ value: 7 });
  });

  it('answers a call made under a retired tool name like the current tool', async () => {
    await call('edit_value', {
      action: 'create',
      content: { kind: 'boolean', name: 'Away', value: false },
    });
    expect(await call('list_automation_values', {})).toStrictEqual(await call('list_values', {}));
  });

  it('still runs a stored tool step that names a retired tool', async () => {
    const created = await call('edit_value', {
      action: 'create',
      content: { kind: 'number', name: 'Level', value: 4, bounds: { overflow: 'reject' } },
    });
    const valueId = VALUE.parse(created).id;
    const row = await createAutomation(rig(), 'Raise', {
      actions: [
        {
          type: 'tool',
          profileId: rig().profileId,
          tool: 'apply_automation_value_operation',
          args: { valueId, body: { kind: 'number', operation: { type: 'add', value: 3 } } },
        },
      ],
    });
    expect((await startAndFinish(rig(), row.id)).status).toBe('succeeded');
    const [value] = await rig().request(API_ENDPOINTS.listAutomationValues);
    expect(value?.content).toMatchObject({ value: 7 });
  });

  it('schedules a one-off action through the same scheduler as the app', async () => {
    await call('edit_schedule', {
      action: 'create',
      timing: { kind: 'in', seconds: 30 },
      steps: [
        {
          kind: 'tool',
          tool: 'control_devices',
          args: {
            changes: [
              { target: { deviceIds: [rig().ids.lamp] }, capability: 'power', value: true },
            ],
          },
        },
      ],
    });
    const rows = await rig().request(API_ENDPOINTS.listSchedules);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.via).toBe('assistant');
  });
});
