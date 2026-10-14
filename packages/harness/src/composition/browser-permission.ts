import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { z } from 'zod';

const BROWSER_SERVER = 'playwright-mcp';
const RESOURCE_TOOLS = new Set([
  'list_mcp_resources',
  'list_mcp_resource_templates',
  'read_mcp_resource',
]);
const RESOURCE_TARGET = z.object({ server: z.literal(BROWSER_SERVER) });

export function browserPermissionDenial(
  ctx: Context,
  execution: Readonly<ToolExecution>,
): string | undefined {
  if (
    !execution.name.startsWith(`mcp__${BROWSER_SERVER}__`) &&
    !(RESOURCE_TOOLS.has(execution.name) && RESOURCE_TARGET.safeParse(execution.arguments).success)
  )
    return undefined;
  const agent = execution.agent;
  if (agent === undefined) return 'Headless browser tools require an owned local session.';
  if (ctx.sandboxPolicy.resolve({ session: agent.session }).mode !== 'danger-full-access')
    return 'Headless browser tools require current Full access; the browser provider cannot enforce a file or network sandbox.';
  return undefined;
}
