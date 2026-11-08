import type { Context } from '@deepseek-ai/cordis';
import type { StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { MEMORY_ACTION_FIELDS, MEMORY_TOOL } from './memory/tool';

export const name = 'tool-arguments';

export type ActionFields = Readonly<Record<string, readonly string[]>>;

const GOAL_ACTION_FIELDS: ActionFields = {
  objective: ['edit'],
  max_goal_rounds: ['edit'],
  blocked_reason: ['blocked'],
};

const ACTION_FIELDS: Readonly<Record<string, ActionFields>> = {
  [MEMORY_TOOL]: MEMORY_ACTION_FIELDS,
  update_goal: GOAL_ACTION_FIELDS,
};

const ARGUMENTS = z.record(z.string(), z.unknown());

const PARAMETERS = z.looseObject({ required: z.array(z.string()).optional() });

const log = new Logger('hub.harness');

function parsed(tool: string, raw: string): Record<string, unknown> | undefined {
  if (raw.trim().length === 0) return undefined;
  try {
    const result = ARGUMENTS.safeParse(JSON.parse(raw));
    return result.success ? result.data : undefined;
  } catch (cause) {
    log.warn('tool.arguments_not_json', { tool, cause: String(cause) });
    return undefined;
  }
}

function blank(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && Object.keys(value).length === 0;
}

function required(schema: ToolSchema | undefined): ReadonlySet<string> | undefined {
  if (schema === undefined) return undefined;
  const parameters = PARAMETERS.safeParse(schema.parameters);
  return new Set(parameters.success ? (parameters.data.required ?? []) : []);
}

function belongs(fields: ActionFields | undefined, action: unknown, key: string): boolean {
  const actions = fields?.[key];
  return actions === undefined || (typeof action === 'string' && actions.includes(action));
}

export function normalizeToolArguments(
  tool: string,
  schema: ToolSchema | undefined,
  raw: string,
): string {
  const args = parsed(tool, raw);
  if (args === undefined) return raw;
  const needed = required(schema);
  const fields = ACTION_FIELDS[tool];
  const kept = Object.entries(args).filter(
    ([key, value]) =>
      needed?.has(key) === true ||
      (!(needed !== undefined && blank(value)) && belongs(fields, args['action'], key)),
  );
  return kept.length === Object.keys(args).length ? raw : JSON.stringify(Object.fromEntries(kept));
}

function normalizedChunk(tools: readonly ToolSchema[], chunk: StreamChunk): StreamChunk {
  if (chunk.type !== 'block-end' || chunk.block.type !== 'tool-call') return chunk;
  const call = chunk.block;
  const schema = tools.find((tool) => tool.name === call.name);
  const normalized = normalizeToolArguments(call.name, schema, call.arguments);
  return normalized === call.arguments
    ? chunk
    : { ...chunk, block: { ...call, arguments: normalized } };
}

async function* normalizedStream(
  tools: readonly ToolSchema[],
  stream: AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  for await (const chunk of stream) yield normalizedChunk(tools, chunk);
}

export function mount(ctx: Context): Promise<void> {
  ctx.on('llm/stream', (options, next) => normalizedStream(options.tools ?? [], next()));
  return Promise.resolve();
}
