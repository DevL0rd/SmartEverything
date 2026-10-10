import {
  ApiError,
  CommandRefusedError,
  InvalidValueError,
  MCP_TOOLS,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { StoreNotFoundError } from '../../store/context';
import {
  JSON_RPC_ERRORS,
  errorMessage,
  negotiatedVersion,
  resultMessage,
  type RpcRequest,
} from './protocol';
import { SERVER_INFO, SERVER_INSTRUCTIONS } from './instructions';
import { resourceList, resourceRead } from './resources';
import { TOOLS, toolNamed } from './tools';
import { ToolError, type Tool, type ToolContext, type ToolOutput } from './tools/registry';

const REFUSAL_LOGGED = 300;

const CALL = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

function contentOf(output: ToolOutput): readonly Record<string, unknown>[] {
  const images = (output.images ?? []).map((image) => ({
    type: 'image',
    data: image.data,
    mimeType: image.mimeType,
  }));
  return [{ type: 'text', text: JSON.stringify(output.structured) }, ...images];
}

function switchedOff(context: ToolContext): ReadonlySet<string> {
  return new Set(context.store.settings.read().mcp_disabled_tools);
}

function inScope(context: ToolContext, name: string): boolean {
  const areas = context.caller?.areas;
  if (areas === undefined) {
    return true;
  }
  const text = MCP_TOOLS.find((candidate) => candidate.name === name);
  return text !== undefined && areas.includes(text.area);
}

function enabledTools(context: ToolContext): readonly Tool[] {
  const off = switchedOff(context);
  return TOOLS.filter((tool) => !off.has(tool.name) && inScope(context, tool.name));
}

interface Refusal {
  readonly code: string;
  readonly message: string;
}

function failed(request: RpcRequest, error: Refusal): unknown {
  return resultMessage(request.id, {
    content: [{ type: 'text', text: `${error.code}: ${error.message}` }],
    structuredContent: { error },
    isError: true,
  });
}

function refusal(cause: unknown): Refusal | null {
  if (cause instanceof ToolError || cause instanceof ApiError) {
    return { code: cause.code, message: cause.message };
  }
  if (cause instanceof StoreNotFoundError) {
    return { code: 'not_found', message: cause.message };
  }
  if (cause instanceof CommandRefusedError || cause instanceof InvalidValueError) {
    return { code: 'command_refused', message: cause.message };
  }
  return null;
}

interface Success {
  readonly request: RpcRequest;
  readonly log: Logger;
  readonly name: string;
}

function succeeded(done: Success, output: ToolOutput): unknown {
  const { request, name } = done;
  done.log.info('tool.succeeded', { tool: name });
  return resultMessage(request.id, {
    content: contentOf(output),
    structuredContent: output.structured,
    isError: false,
  });
}

async function called(request: RpcRequest, context: ToolContext, log: Logger): Promise<unknown> {
  const call = CALL.safeParse(request.params);
  if (!call.success) {
    return errorMessage(request.id, JSON_RPC_ERRORS.invalidParams, 'tools/call needs a tool name');
  }
  const tool = toolNamed(call.data.name);
  if (tool === undefined) {
    return errorMessage(
      request.id,
      JSON_RPC_ERRORS.invalidParams,
      `Unknown tool: ${call.data.name}`,
    );
  }
  if (!inScope(context, tool.name)) {
    return failed(request, {
      code: 'forbidden',
      message: `This plugin may not use ${tool.name}; the owner chooses what it can reach.`,
    });
  }
  if (switchedOff(context).has(tool.name)) {
    log.warn('tool.switched_off', { tool: tool.name });
    return failed(request, {
      code: 'tool_switched_off',
      message: `The owner turned off ${tool.name}. They can turn it on in SmartEverything under Settings › AI assistants › Exposed tools.`,
    });
  }
  try {
    const args = call.data.arguments ?? {};
    return succeeded({ request, log, name: tool.name }, await tool.call(context, args));
  } catch (cause) {
    const refused = refusal(cause);
    if (refused === null) {
      log.error('tool.failed', cause, { tool: tool.name });
    } else {
      log.warn('tool.refused', {
        tool: tool.name,
        refusal: refused.code,
        message: refused.message.slice(0, REFUSAL_LOGGED),
      });
    }
    return failed(
      request,
      refused ?? {
        code: 'internal',
        message: 'The tool failed inside the server; its log has the detail.',
      },
    );
  }
}

function readResource(request: RpcRequest, context: ToolContext): unknown {
  const read = resourceRead(request.params, enabledTools(context));
  return read === null
    ? errorMessage(request.id, JSON_RPC_ERRORS.invalidParams, 'Unknown resource')
    : resultMessage(request.id, read);
}

export async function answered(
  request: RpcRequest,
  context: ToolContext,
  log: Logger,
): Promise<unknown> {
  switch (request.method) {
    case 'initialize':
      return resultMessage(request.id, {
        protocolVersion: negotiatedVersion(request.params?.['protocolVersion']),
        capabilities: { tools: { listChanged: true }, resources: {} },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS,
      });
    case 'ping':
      return resultMessage(request.id, {});
    case 'tools/list':
      return resultMessage(request.id, {
        tools: enabledTools(context).map((tool) => tool.listing),
      });
    case 'tools/call':
      return called(request, context, log);
    case 'resources/list':
      return resultMessage(request.id, resourceList());
    case 'resources/read':
      return readResource(request, context);
    default:
      return errorMessage(
        request.id,
        JSON_RPC_ERRORS.methodNotFound,
        `This server does not answer ${request.method}`,
      );
  }
}
