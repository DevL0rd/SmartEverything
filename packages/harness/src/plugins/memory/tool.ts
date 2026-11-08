import type { Context } from '@deepseek-ai/cordis';
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import { AI_MEMORY_TOOL_ARGUMENTS } from '@smarteverything/domain';
import type { AiMemoryAccess } from '@smarteverything/domain';
import { z } from 'zod';
import { HarnessRuntimeError } from '../../host/errors';

type ToolDefinition = Parameters<Context['tools']['register']>[0];

export const MEMORY_TOOL = 'memory';

export const MEMORY_ACTION_FIELDS: Readonly<Record<string, readonly string[]>> = {
  scope: ['view', 'add'],
  query: ['view'],
  id: ['edit', 'delete'],
  text: ['add', 'edit'],
  kind: ['add', 'edit'],
  importance: ['add', 'edit'],
  happened_on: ['add', 'edit'],
  valid_until: ['add', 'edit'],
};

export const MEMORY_DESCRIPTION =
  'Keep, read, edit and delete notes that survive between chats. scope person is private to the person you are talking with; scope home is shared by the whole home and only an owner can change it. One self-contained fact per note. Do not store secrets, passing task state, passing problems such as errors, failed commands, flaky devices or outages, or the current state of the home. When a note turns out wrong or no longer true, edit it, keeping the change if it matters (for example used to live in X until 2026, now Y), or delete it. action view lists notes (optionally one scope, or only those containing every word of query), add needs scope and text (the note itself), edit needs id and a field to change, delete needs id. Ids come from view.';

export const MEMORY_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: { type: 'string', enum: ['view', 'add', 'edit', 'delete'] },
    scope: { type: 'string', enum: ['person', 'home'] },
    id: { type: 'string', description: 'The id of the note to edit or delete.' },
    text: {
      type: 'string',
      description: 'add and edit: the note itself, one self-contained fact.',
    },
    kind: {
      type: 'string',
      enum: ['fact', 'preference', 'episode', 'vocabulary'],
    },
    importance: { type: 'integer', description: 'How much it matters long term, 0 to 100.' },
    happened_on: { type: 'string', description: 'Date of an episode, YYYY-MM-DD.' },
    valid_until: { type: 'string', description: 'Date the note stops being true, YYYY-MM-DD.' },
    query: { type: 'string', description: 'view only: words every listed note must contain.' },
  },
} satisfies ObjectJsonSchema;

export function memoryTool(access: () => AiMemoryAccess | undefined): ToolDefinition {
  return {
    name: MEMORY_TOOL,
    description: MEMORY_DESCRIPTION,
    parameters: MEMORY_PARAMETERS,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (raw, execution): Promise<unknown> => {
      const agent = execution.agent;
      const bound = access();
      if (agent === undefined || bound === undefined)
        throw new HarnessRuntimeError('runtime_unavailable', 'Memory needs a conversation.');
      const args = AI_MEMORY_TOOL_ARGUMENTS.safeParse(raw);
      if (!args.success)
        throw new HarnessRuntimeError('operation_failed', z.prettifyError(args.error));
      return bound.call(agent.id, args.data);
    },
  };
}
