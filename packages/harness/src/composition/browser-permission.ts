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
const REASON =
  'The headless browser cannot enforce a file or network sandbox, so it needs Full access for this action.';

function isBrowserCall(execution: Readonly<ToolExecution>): boolean {
  return (
    execution.name.startsWith(`mcp__${BROWSER_SERVER}__`) ||
    (RESOURCE_TOOLS.has(execution.name) && RESOURCE_TARGET.safeParse(execution.arguments).success)
  );
}

export function mountBrowserPermission(scope: Context): void {
  scope.on('tools/pre-execute', async (execution, next) => {
    const decision = await next();
    if (decision.kind !== 'allow' || !isBrowserCall(execution)) return decision;
    const agent = execution.agent;
    if (
      agent !== undefined &&
      scope.sandboxPolicy.resolve({ session: agent.session }).mode === 'danger-full-access'
    )
      return decision;
    return { kind: 'ask', reason: REASON, displayReason: { en: REASON } };
  });
}
