import { MCP_ROUTES, isMcpToolName, type McpToolName } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { storedRow } from '../codec';
import { jsonText, type Sql } from '../sql';

type Args = Readonly<Record<string, unknown>>;

interface Renamed {
  readonly tool: McpToolName;
  readonly args: (args: Args) => Args | null;
}

const DISABLED = storedRow(z.strictObject({ disabled: z.array(z.string()) }), {
  json: ['disabled'],
});

const STEP = z.looseObject({
  kind: z.string(),
  tool: z.string().optional(),
  args: z.unknown().optional(),
});

const SCHEDULE = storedRow(z.strictObject({ id: z.string(), steps: z.array(STEP) }), {
  json: ['steps'],
});

const ARGS = z.record(z.string(), z.unknown());

const SET_DEVICE = z.strictObject({
  deviceId: z.string(),
  capability: z.string(),
  value: z.unknown(),
  unit: z.string().optional(),
  confirm: z.boolean().optional(),
});

const LIVE_STATES = "('scheduled', 'running', 'waiting')";

function routedRenames(): Map<string, Renamed> {
  const renames = new Map<string, Renamed>();
  for (const [tool, route] of MCP_ROUTES) {
    if ('part' in route && route.part !== tool) {
      renames.set(route.part, { tool, args: (args) => args });
    }
    if ('key' in route) {
      for (const [value, part] of Object.entries(route.parts)) {
        renames.set(part, { tool, args: (args) => ({ [route.key]: value, ...args }) });
      }
    }
  }
  return renames;
}

function deviceChange(args: Args): Args | null {
  const parsed = SET_DEVICE.safeParse(args);
  if (!parsed.success) {
    return null;
  }
  const { deviceId, capability, value, unit } = parsed.data;
  const change = { target: { deviceIds: [deviceId] }, capability, value };
  return { changes: [unit === undefined ? change : { ...change, unit }] };
}

const RENAMES: ReadonlyMap<string, Renamed> = new Map([
  ...routedRenames(),
  ['set_device', { tool: 'control_devices', args: deviceChange }],
]);

function renamedStep(step: z.infer<typeof STEP>): z.infer<typeof STEP> {
  const rename =
    step.kind === 'tool' && step.tool !== undefined ? RENAMES.get(step.tool) : undefined;
  const args = ARGS.safeParse(step.args ?? {});
  const renamed = rename === undefined || !args.success ? null : rename.args(args.data);
  return rename === undefined || renamed === null
    ? step
    : { ...step, tool: rename.tool, args: renamed };
}

function renameDisabled(sql: Sql): number {
  const row = sql.get(DISABLED, 'select mcp_disabled_tools as disabled from settings where id = 1');
  if (row === undefined) {
    return 0;
  }
  const disabled = new Set(
    row.disabled.map((name) => RENAMES.get(name)?.tool ?? name).filter(isMcpToolName),
  );
  sql.run(
    'rename the switched-off tools',
    'update settings set mcp_disabled_tools = $disabled where id = 1',
    { disabled: jsonText([...disabled]) },
  );
  return disabled.size;
}

function renameSchedules(sql: Sql): number {
  const rows = sql.all(
    SCHEDULE,
    `select id, steps from scheduled_actions where state in ${LIVE_STATES}`,
  );
  for (const row of rows) {
    sql.run(
      'rename the tools of a scheduled action',
      'update scheduled_actions set steps = $steps where id = $id',
      { id: row.id, steps: jsonText(row.steps.map(renamedStep)) },
    );
  }
  return rows.length;
}

export function renameToolNames(sql: Sql): LogPayload {
  return { disabled: renameDisabled(sql), schedules: renameSchedules(sql) };
}
