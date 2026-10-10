import { z } from 'zod';

const MODES = ['edit', 'snapshot', 'bash-done', 'stop', 'end'] as const;
type Mode = (typeof MODES)[number];

const id = z.string().regex(/^[\w-]+$/);
export const agentInput = z.object({
  session_id: id,
  agent_id: id.optional(),
  agent_type: z.string().optional(),
});
export const editInput = agentInput.extend({ tool_input: z.object({ file_path: z.string() }) });
export const bashInput = agentInput.extend({ tool_input: z.object({ command: z.string() }) });
export const snapshotInput = z.discriminatedUnion('tool_name', [
  agentInput.extend({
    tool_name: z.literal('Bash'),
    tool_input: z
      .object({ command: z.string(), run_in_background: z.boolean().optional() })
      .loose(),
  }),
  agentInput.extend({
    tool_name: z.enum(['Edit', 'Write', 'MultiEdit']),
    tool_input: z.object({ file_path: z.string() }),
  }),
]);
export const stopInput = agentInput.extend({ stop_hook_active: z.boolean().optional() });

export type AgentInput = z.infer<typeof agentInput>;

export class HookError extends Error {
  constructor(
    name:
      | 'HookInputError'
      | 'HookModeError'
      | 'GitCheckError'
      | 'StateError'
      | 'TscOutputError'
      | 'TestOutputError',
    message: string,
  ) {
    super(`claude-hook: ${message}`);
    this.name = name;
  }
}

type JsonResult =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

export function parseJson(source: string): JsonResult {
  try {
    const value: unknown = JSON.parse(source);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, error: error.message };
    throw error;
  }
}

export function parseInput<T>(mode: string, schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = z.prettifyError(parsed.error);
    throw new HookError('HookInputError', `${mode}: invalid stdin: ${detail}`);
  }
  return parsed.data;
}

export function readStdin(mode: string, source: string): unknown {
  const parsed = parseJson(source);
  if (!parsed.ok) {
    throw new HookError('HookInputError', `${mode}: stdin is not JSON: ${parsed.error}`);
  }
  return parsed.value;
}

export function parseMode(value: string | undefined): Mode {
  const parsed = z.enum(MODES).safeParse(value);
  if (!parsed.success) {
    const expected = MODES.join(', ');
    throw new HookError('HookModeError', `unknown mode "${String(value)}", expected ${expected}`);
  }
  return parsed.data;
}
