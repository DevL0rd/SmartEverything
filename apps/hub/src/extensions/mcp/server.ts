import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  ToolSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from '@smarteverything/logging';
import { SERVER_INFO, serverInstructions } from './instructions';
import { enabledTools, runTool } from './dispatch';
import { resourceList, resourceRead } from './resources';
import { COMMON_TOOL_NAMES } from '../../ai-tools/tool-sets';
import { TOOLS } from './tools';
import type { ToolContext, ToolOutput } from './tools/registry';

const CAPABILITIES = { tools: { listChanged: true }, resources: {} } as const;

const CLIENTS_WITH_TOOL_SEARCH: readonly string[] = ['claude-code/'];

const EXTERNAL_CORE: ReadonlySet<string> = new Set([
  ...COMMON_TOOL_NAMES,
  'tool_search',
  'tool_read',
  'operation_call',
]);

export function listedFor(userAgent: string): (name: string) => boolean {
  const searches = CLIENTS_WITH_TOOL_SEARCH.some((client) =>
    userAgent.toLowerCase().startsWith(client),
  );
  return searches ? (): boolean => true : (name): boolean => EXTERNAL_CORE.has(name);
}

const LISTED = TOOLS.map((tool) => ({ name: tool.name, listing: ToolSchema.parse(tool.listing) }));

function contentOf(output: ToolOutput): CallToolResult['content'] {
  return [
    { type: 'text', text: JSON.stringify(output.structured) },
    ...(output.images ?? []).map((image) => ({
      type: 'image' as const,
      data: image.data,
      mimeType: image.mimeType,
    })),
  ];
}

async function called(
  context: ToolContext,
  log: Logger,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<CallToolResult> {
  const run = await runTool(context, name, args, log);
  switch (run.kind) {
    case 'unknown':
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    case 'refused':
      return {
        content: [{ type: 'text', text: `${run.refusal.code}: ${run.refusal.message}` }],
        isError: true,
      };
    case 'done':
      return {
        content: contentOf(run.output),
        structuredContent: run.output.structured,
        isError: false,
      };
  }
}

export function notifierServer(): McpServer {
  return new McpServer(SERVER_INFO, { capabilities: CAPABILITIES });
}

export function createMcpServer(context: ToolContext, log: Logger, userAgent: string): McpServer {
  const listed = listedFor(userAgent);
  log.debug('server.created', { via: context.caller?.via, clientId: context.actor?.clientId });
  const mcp = new McpServer(SERVER_INFO, {
    capabilities: CAPABILITIES,
    instructions: serverInstructions(enabledTools(context).map((tool) => tool.name)),
  });
  const { server } = mcp;
  server.onerror = (cause): void => {
    log.warn('request.rejected', { message: cause.message });
  };
  server.setRequestHandler(ListToolsRequestSchema, () => {
    const enabled = new Set(
      enabledTools(context)
        .map((tool) => tool.name)
        .filter(listed),
    );
    log.debug('tools.listed', {
      enabled: enabled.size,
      total: LISTED.length,
      via: context.caller?.via,
      profileId: context.actor?.profileId,
    });
    return {
      tools: LISTED.filter(({ name }) => enabled.has(name)).map(({ listing }) => listing),
    };
  });
  server.setRequestHandler(CallToolRequestSchema, ({ params }) =>
    called(context, log, params.name, params.arguments ?? {}),
  );
  server.setRequestHandler(ListResourcesRequestSchema, () => {
    log.trace('resources.listed', { via: context.caller?.via });
    return resourceList();
  });
  server.setRequestHandler(ReadResourceRequestSchema, ({ params }) => {
    const read = resourceRead(params.uri, enabledTools(context));
    log.debug('resource.read', { found: read !== null, via: context.caller?.via });
    if (read === null) {
      throw new McpError(ErrorCode.InvalidParams, 'Unknown resource');
    }
    return read;
  });
  return mcp;
}
