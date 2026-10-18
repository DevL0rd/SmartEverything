import type { Context } from '@deepseek-ai/cordis';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { HarnessRuntime } from '../host/runtime';
import { HarnessRuntimeError } from '../host/errors';
import type { JsonValue } from '@smarteverything/domain';

const INPUT = z.strictObject({ path: z.string().min(1).max(4096) });
const PRIMARY_DIRECTORY_TIMEOUT_MS = 300_000;
const UNAVAILABLE_INDEX: JsonValue = {
  state: 'unavailable',
  reason: 'The code indexer is not enabled for this session.',
};

export function mountWorkingDirectoryTool(ctx: Context, runtime: HarnessRuntime): void {
  ctx.tools.register({
    name: 'set_working_directory',
    description:
      'Choose an existing primary folder on this selected machine for subsequent native file paths, shell defaults and indexing in the same chat. Accepts an absolute path or one relative to the current folder. Refreshes its code index once when available, asking through the current permission flow if cache writes need approval. Directory changes remain committed if indexing fails. Does not change permissions, move central artifacts or retarget running processes.',
    timeoutMs: PRIMARY_DIRECTORY_TIMEOUT_MS,
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', minLength: 1, maxLength: 4096 } },
      required: ['path'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (
      raw,
      execution,
    ): Promise<{ readonly directory: string; readonly index: JsonValue }> => {
      const agent = execution.agent;
      if (agent === undefined)
        throw new HarnessRuntimeError(
          'ownership_lost',
          'A primary folder requires its owned native chat.',
        );
      const input = INPUT.parse(raw);
      const directory = await runtime.directory(agent.id, input.path, execution.signal);
      if (ctx.tools.get('codegraph_index', agent) === undefined)
        return { directory, index: UNAVAILABLE_INDEX };
      const result = await ctx.tools.execute({
        callId: ToolCallId(randomUUID()),
        rootCallId: execution.rootCallId,
        parent: execution.token,
        name: 'codegraph_index',
        arguments: { project_path: directory },
        agent,
        signal: execution.signal,
      });
      if (result.isError)
        throw new HarnessRuntimeError('operation_failed', result.error.message, agent.id);
      return { directory, index: result.value };
    },
  });
}
