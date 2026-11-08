import {
  SHOW_IN_APP_INPUT,
  SHOW_IN_APP_RESULT,
  type ShowInAppInput,
} from '@smarteverything/domain';
import { operate, type OperatingContext } from './acting';
import { ToolError, WRITES, defineTool, type Tool } from './registry';

const OPEN = SHOW_IN_APP_INPUT.options[0].omit({ action: true });
const HIGHLIGHT = SHOW_IN_APP_INPUT.options[1].omit({ action: true });
const DISMISS = SHOW_IN_APP_INPUT.options[2].omit({ action: true });

async function shown(
  context: OperatingContext,
  input: ShowInAppInput,
): Promise<Record<string, unknown>> {
  const reply = await operate(context, 'showInApp', { body: input });
  const result = SHOW_IN_APP_RESULT.safeParse(reply);
  if (!result.success)
    throw new ToolError(
      `The server’s answer to showing something is not valid: ${result.error.message}`,
      'internal',
    );
  return { ...result.data };
}

export const SHOW_IN_APP_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'show_in_app',
    input: OPEN,
    annotations: WRITES,
    answer: true,
    run: async (context, input) => ({
      structured: await shown(context, { ...input, action: 'open' }),
    }),
  }),
  defineTool({
    name: 'point_in_app',
    input: HIGHLIGHT,
    annotations: WRITES,
    answer: true,
    run: async (context, input) => ({
      structured: await shown(context, { ...input, action: 'highlight' }),
    }),
  }),
  defineTool({
    name: 'clear_app_pointer',
    input: DISMISS,
    annotations: WRITES,
    answer: true,
    run: async (context, input) => ({
      structured: await shown(context, { ...input, action: 'dismiss' }),
    }),
  }),
];
