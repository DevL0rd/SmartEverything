import type { Logger } from '@smarteverything/logging';
import { MCP_ONLY_TOOLS, isMcpToolName } from '@smarteverything/domain';
import { z } from 'zod';
import { answered } from '../extensions/mcp/dispatch';
import { TOOLS, toolNamed } from '../extensions/mcp/tools';
import type { ToolContext } from '../extensions/mcp/tools/registry';
import {
  failure,
  type HubTool,
  type HubToolResult,
  type ToolCaller,
  type ToolPicture,
  type ToolSource,
} from './hub-tool';
import { toolLine } from './tool-lines';

const LISTING = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()),
  annotations: z.object({
    readOnlyHint: z.boolean(),
    destructiveHint: z.boolean(),
    openWorldHint: z.boolean(),
  }),
});

const CONTENT = z.object({
  type: z.string(),
  text: z.string().optional(),
  data: z.string().optional(),
  mimeType: z.string().optional(),
});

const REPLY = z.union([
  z.object({
    result: z.object({
      content: z.array(CONTENT),
      structuredContent: z.unknown().optional(),
      isError: z.boolean(),
    }),
  }),
  z.object({ error: z.object({ code: z.number(), message: z.string() }) }),
]);

const SE_TOOLS: readonly HubTool[] = TOOLS.filter(
  (tool) => !isMcpToolName(tool.name) || !MCP_ONLY_TOOLS.has(tool.name),
).map((tool) => {
  const listing = LISTING.parse(tool.listing);
  return {
    name: listing.name,
    title: listing.title,
    description: listing.description,
    inputSchema: listing.inputSchema,
    annotations: listing.annotations,
    origin: { kind: 'se' },
    humanOnly: false,
    confirms: (args: Readonly<Record<string, unknown>>): boolean => tool.confirms(args),
  };
});

function picturesOf(content: readonly z.infer<typeof CONTENT>[]): ToolPicture[] {
  return content.flatMap((part) =>
    part.type === 'image' && part.data !== undefined && part.mimeType !== undefined
      ? [{ data: Buffer.from(part.data, 'base64'), mimeType: part.mimeType }]
      : [],
  );
}

export interface SeToolsOptions {
  readonly context: ToolContext;
  readonly deviceName: (id: string) => string | null;
  readonly log: Logger;
}

export class SeTools implements ToolSource {
  private sequence = 0;

  constructor(private readonly options: SeToolsOptions) {}

  tools(): readonly HubTool[] {
    const off = new Set(this.options.context.store.settings.read().mcp_disabled_tools);
    return SE_TOOLS.filter((tool) => !off.has(tool.name));
  }

  changes(listener: () => void): () => void {
    return this.options.context.store.feed.subscribe((change) => {
      if (change.table === 'settings') {
        listener();
      }
    });
  }

  validate(tool: HubTool, args: Readonly<Record<string, unknown>>): string | null {
    const found = toolNamed(tool.name);
    return found === undefined
      ? `There is no tool named ${tool.name}`
      : found.check(this.options.context, args);
  }

  async call(
    tool: HubTool,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    if (caller.clientId === null && caller.role !== 'owner') {
      return failure('This needs the device of the person it runs for');
    }
    this.sequence += 1;
    const reply = REPLY.parse(
      await answered(
        {
          jsonrpc: '2.0',
          id: `ai-${String(this.sequence)}`,
          method: 'tools/call',
          params: { name: tool.name, arguments: { ...args } },
        },
        {
          ...this.options.context,
          actor: { clientId: caller.clientId, profileId: caller.profileId, chatId: caller.chatId },
        },
        this.options.log,
      ),
    );
    if ('error' in reply) {
      return failure(reply.error.message);
    }
    const { content, structuredContent, isError } = reply.result;
    const text = content.find((part) => part.type === 'text')?.text ?? '';
    const line = toolLine({ tool, args, failed: isError, deviceName: this.options.deviceName });
    if (isError) {
      return { response: { error: text, schema: tool.inputSchema }, line, pictures: [] };
    }
    return { response: { result: structuredContent ?? text }, line, pictures: picturesOf(content) };
  }
}
