import { z } from 'zod';
import { issuesOf } from '../../../../extensions/mcp/tools/registry';
import {
  failure,
  type HubToolResult,
  type ToolAnnotationHints,
  type ToolCaller,
  type ToolPicture,
} from '../../../../ai-tools/hub-tool';
import type { PluginTool } from '../../contract';
import type { Operation } from '../operations/kit';
import type { DiscordServices } from '../services';
import { ActionRunner, boundedResult, type ParsedCall } from './action-runner';
import {
  EVENT_ID,
  IDEMPOTENCY_KEY,
  USER_REF,
  flatSchemaOf,
  summaryOf,
  type Variant,
} from './schema';

export interface LocalOutput {
  readonly response: unknown;
  readonly pictures: readonly ToolPicture[];
}

export interface LocalAction {
  readonly action: string;
  readonly description: string;
  readonly shape: z.ZodRawShape;
  readonly run: (
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
    eventId: string | undefined,
  ) => Promise<LocalOutput>;
}

export function plain(response: unknown): LocalOutput {
  return { response, pictures: [] };
}

export interface ActionToolSpec {
  readonly name: string;
  readonly title: string;
  readonly intro: string;
  readonly annotations: ToolAnnotationHints;
  readonly operations: readonly Operation[];
  readonly local: readonly LocalAction[];
}

interface Entry {
  readonly action: string;
  readonly description: string;
  readonly schema: z.ZodObject;
}

const ACTION_NAME = z.object({ action: z.string() });

function operationEntry(op: Operation): Entry {
  const shape = 'userId' in op.shape ? { ...op.shape, userId: USER_REF } : op.shape;
  return {
    action: op.action,
    description: op.description,
    schema: z.strictObject({
      action: z.literal(op.action),
      eventId: EVENT_ID,
      ...(op.mode === 'read' ? {} : { idempotencyKey: IDEMPOTENCY_KEY }),
      ...shape,
    }),
  };
}

function localEntry(local: LocalAction): Entry {
  return {
    action: local.action,
    description: local.description,
    schema: z.strictObject({ action: z.literal(local.action), eventId: EVENT_ID, ...local.shape }),
  };
}

function parsedOf(raw: Readonly<Record<string, unknown>>): ParsedCall {
  const { action: _action, eventId, idempotencyKey, ...args } = raw;
  const known = z
    .object({ eventId: z.string().optional(), idempotencyKey: z.string().optional() })
    .parse({ eventId, idempotencyKey });
  return { eventId: known.eventId, idempotencyKey: known.idempotencyKey, args };
}

function invalid(reason: string): string {
  return `The arguments are not valid: ${reason}`;
}

export function actionTool(services: DiscordServices, spec: ActionToolSpec): PluginTool {
  const entries = [...spec.operations.map(operationEntry), ...spec.local.map(localEntry)];
  const variants: Variant[] = entries.map((entry) => ({
    action: entry.action,
    schema: entry.schema,
  }));
  const runner = new ActionRunner(services);
  return {
    name: spec.name,
    title: spec.title,
    description: [
      spec.intro,
      ...entries.map((entry) => `${summaryOf(entry.action, entry.schema)}: ${entry.description}`),
    ].join('\n'),
    inputSchema: flatSchemaOf(variants),
    annotations: spec.annotations,
    humanOnly: false,
    validate: (raw): string | null => {
      const parsed = check(entries, raw);
      return parsed.success ? null : invalid(parsed.reason);
    },
    run: async (raw, caller): Promise<HubToolResult> => {
      const parsed = check(entries, raw);
      if (!parsed.success) {
        return failure(invalid(parsed.reason));
      }
      try {
        return await execute({ services, runner, spec }, parsed, caller);
      } catch (cause) {
        return failure(cause instanceof Error ? cause.message : String(cause));
      }
    },
  };
}

interface Dispatch {
  readonly services: DiscordServices;
  readonly runner: ActionRunner;
  readonly spec: ActionToolSpec;
}

async function execute(
  { services, runner, spec }: Dispatch,
  parsed: Extract<Checked, { readonly success: true }>,
  caller: ToolCaller,
): Promise<HubToolResult> {
  const call = parsedOf(parsed.data);
  const local = spec.local.find((item) => item.action === parsed.action);
  if (local !== undefined) {
    services.identity.assertReady();
    const given = call.idempotencyKey === undefined ? {} : { idempotencyKey: call.idempotencyKey };
    const out = await local.run({ ...call.args, ...given }, caller, call.eventId);
    return { response: boundedResult(out.response), line: '', pictures: out.pictures };
  }
  const op = spec.operations.find((item) => item.action === parsed.action);
  if (op === undefined) {
    return failure(`No such action ${parsed.action}`);
  }
  return { response: boundedResult(await runner.run(op, call, caller)), line: '', pictures: [] };
}

type Checked =
  | {
      readonly success: true;
      readonly action: string;
      readonly data: Readonly<Record<string, unknown>>;
    }
  | { readonly success: false; readonly reason: string };

function check(entries: readonly Entry[], raw: Readonly<Record<string, unknown>>): Checked {
  const named = ACTION_NAME.safeParse(raw);
  const entry = named.success
    ? entries.find((item) => item.action === named.data.action)
    : undefined;
  if (entry === undefined) {
    return {
      success: false,
      reason: `action must be one of ${entries.map((item) => item.action).join(', ')}`,
    };
  }
  const parsed = entry.schema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, reason: issuesOf(parsed.error) };
  }
  return {
    success: true,
    action: entry.action,
    data: z.record(z.string(), z.unknown()).parse(parsed.data),
  };
}
