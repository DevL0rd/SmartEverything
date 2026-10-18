import type { CodexProviderTurn } from '@smarteverything/domain';
import type { CodexClient } from './client';
import { CodexRuntimeError } from './errors';
import { threadOptions, requireExecutionLocation } from './options';
import { THREAD_REPLY } from './protocol';

export async function openThread(
  turn: CodexProviderTurn,
  client: CodexClient,
  location: { readonly cwd: string; readonly roots: readonly string[] },
): Promise<string> {
  const thread = THREAD_REPLY.parse(
    await client.request(turn.session_id === null ? 'thread/start' : 'thread/resume', {
      ...(turn.session_id === null ? {} : { threadId: turn.session_id }),
      model: turn.model,
      modelProvider: 'openai',
      allowProviderModelFallback: false,
      ...threadOptions(turn.options, location.cwd, location.roots),
      baseInstructions: turn.system,
      ...(turn.session_id === null
        ? {
            dynamicTools: turn.tools.map((tool) => ({
              type: 'function',
              name: tool.name,
              description: tool.description,
              inputSchema: tool.input_schema,
            })),
          }
        : {}),
    }),
  );
  if (thread.modelProvider !== 'openai')
    throw new CodexRuntimeError(
      'thread/start',
      'Codex reported a different inference provider than selected.',
      true,
    );
  requireExecutionLocation(thread, location);
  return thread.thread.id;
}
