import { validateExecutionAuthority } from '../assistant/execution-authority';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { answered } from '../extensions/mcp/dispatch';
import { TOOLS, toolNamed } from '../extensions/mcp/tools';
import type { ToolActor, ToolContext } from '../extensions/mcp/tools/registry';
import { withoutAbsentFields } from './arguments';
import {
  failure,
  needsOwnDevice,
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
    title: z.string(),
    idempotentHint: z.boolean(),
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

const SE_TOOLS: readonly HubTool[] = TOOLS.map((tool) => {
  const listing = LISTING.parse(tool.listing);
  return {
    name: listing.name,
    title: listing.title,
    description: listing.description,
    inputSchema: listing.inputSchema,
    ...(tool.variants === undefined ? {} : { variants: tool.variants }),
    annotations: listing.annotations,
    origin: { kind: 'se' },
    humanOnly: false,
  };
});

function picturesOf(content: readonly z.infer<typeof CONTENT>[]): ToolPicture[] {
  return content.flatMap((part) =>
    part.type === 'image' && part.data !== undefined && part.mimeType !== undefined
      ? [{ data: Buffer.from(part.data, 'base64'), mimeType: part.mimeType }]
      : [],
  );
}

function actorOf(caller: ToolCaller): ToolActor {
  return {
    clientId: caller.clientId,
    ...(caller.authority === undefined ? {} : { authority: caller.authority }),
    profileId: caller.profileId,
    chatId: caller.chatId,
    ...(caller.pluginRequester === undefined ? {} : { pluginRequester: caller.pluginRequester }),
    ...(caller.pluginId === undefined ? {} : { pluginId: caller.pluginId }),
  };
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
      : found.check(this.options.context, withoutAbsentFields(tool.inputSchema, args));
  }

  async call(
    tool: HubTool,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    if (caller.authority !== undefined)
      validateExecutionAuthority(this.options.context.store, caller.authority);
    if (needsOwnDevice(caller)) {
      return failure('This needs the device of the person it runs for');
    }
    this.sequence += 1;
    const reply = REPLY.parse(
      await answered(
        {
          jsonrpc: '2.0',
          id: `ai-${String(this.sequence)}`,
          method: 'tools/call',
          params: {
            name: tool.name,
            arguments: { ...withoutAbsentFields(tool.inputSchema, args) },
          },
        },
        {
          ...this.options.context,
          actor: actorOf(caller),
        },
        this.options.log,
      ),
    );
    if ('error' in reply) {
      return failure(reply.error.message);
    }
    const { content, structuredContent, isError } = reply.result;
    const text = content.find((part) => part.type === 'text')?.text ?? '';
    if (isError) {
      return {
        response: {
          error: text,
          schema: tool.inputSchema,
          ...(tool.variants === undefined ? {} : { variants: tool.variants }),
        },
        line: '',
        pictures: [],
      };
    }
    const line = toolLine({ tool, args, deviceName: this.options.deviceName });
    return { response: { result: structuredContent ?? text }, line, pictures: picturesOf(content) };
  }
}
