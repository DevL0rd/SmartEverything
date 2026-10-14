import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
  type SdkMcpToolDefinition,
} from '@anthropic-ai/claude-agent-sdk';
import { JSON_VALUE, type ProviderTurn, type ProviderContent } from '@smarteverything/domain';
import { z } from 'zod';
import { ProviderPending } from './pending';

export interface ProviderToolResult {
  readonly text: string;
  readonly failed: boolean;
  readonly content?: readonly ProviderContent[];
}

export interface ProviderToolCall {
  readonly call_id: string;
  readonly name: string;
  readonly input: Record<string, z.infer<typeof JSON_VALUE>>;
}

export class ProviderToolSchemaError extends Error {
  override readonly name = 'ProviderToolSchemaError';
}

export class ProviderTools {
  private readonly pending = new ProviderPending<ProviderToolResult>();
  readonly server: McpSdkServerConfigWithInstance;

  constructor(
    tools: ProviderTurn['tools'],
    signal: AbortSignal,
    announce: (call: ProviderToolCall) => void,
  ) {
    this.server = createSdkMcpServer({
      name: 'home',
      version: '1.0.0',
      tools: tools.map((tool) => this.definition(tool, signal, announce)),
    });
  }

  answer(id: string, result: ProviderToolResult): boolean {
    return this.pending.answer(id, result);
  }

  stop(): void {
    this.pending.stop('The provider tool bridge closed.');
  }

  private definition(
    tool: ProviderTurn['tools'][number],
    signal: AbortSignal,
    announce: (call: ProviderToolCall) => void,
  ): SdkMcpToolDefinition<Record<string, z.ZodType>> {
    const schema = z.fromJSONSchema(tool.input_schema);
    if (!(schema instanceof z.ZodObject)) {
      throw new ProviderToolSchemaError(
        `The tool ${tool.name} must declare an object input schema.`,
      );
    }
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: schema.shape,
      handler: async (args: unknown): Promise<CallToolResult> => {
        const input = z.record(z.string(), JSON_VALUE).parse(schema.parse(args));
        const call_id = randomUUID();
        const waiting = this.pending.hold(call_id, signal);
        announce({ call_id, name: tool.name, input });
        const result = await waiting;
        return { content: toolContent(result, call_id), isError: result.failed };
      },
    };
  }
}

function toolContent(result: ProviderToolResult, id: string): CallToolResult['content'] {
  if (result.content === undefined || result.content.length === 0)
    return [{ type: 'text', text: result.text }];
  return result.content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    if (part.type === 'image') return { type: 'image', data: part.data, mimeType: part.media_type };
    return {
      type: 'resource',
      resource: {
        uri: `smarteverything://provider-tools/${encodeURIComponent(id)}`,
        mimeType: part.media_type,
        blob: part.data,
      },
    };
  });
}
