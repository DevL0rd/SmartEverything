import type { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
import type { HarnessRuntime } from '../host/runtime';
import { HarnessRuntimeError } from '../host/errors';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';

const INPUT = z.strictObject({ path: z.string().min(1).max(4096) });
const PRIMARY_DIRECTORY_TIMEOUT_MS = 300_000;

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
      const indexer = ctx.tools.get('codegraph_index', agent);
      if (indexer === undefined)
        return {
          directory,
          index: {
            state: 'unavailable',
            reason: 'The code indexer is not enabled for this session.',
          },
        };
      runtime.assertNativeAccess(agent.id);
      const index = JSON_VALUE.parse(await indexer.execute({ project_path: directory }, execution));
      return { directory, index };
    },
  });
}
