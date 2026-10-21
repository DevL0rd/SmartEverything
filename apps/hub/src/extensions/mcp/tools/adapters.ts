import type { McpPartName } from '@smarteverything/domain';
import { z } from 'zod';
import { AUTOMATION_ADAPTERS } from './adapters-automations';
import { LIFE_ADAPTERS } from './adapters-life';
import {
  ToolError,
  argumentIssues,
  jsonSchemaOf,
  validArguments,
  type Tool,
  type ToolContext,
  type ToolOutput,
} from './registry';

export type Args = Readonly<Record<string, unknown>>;

export interface Adapter {
  readonly input: (base: z.ZodObject) => z.ZodObject;
  readonly prepare?: (context: ToolContext, raw: Args) => Args;
  readonly args?: (context: ToolContext, input: Args) => Args;
  readonly run?: (context: ToolContext, input: Args, base: Tool) => Promise<ToolOutput>;
}

function objectInput(base: Tool): z.ZodObject {
  if (!(base.input instanceof z.ZodObject)) {
    throw new ToolError(`The tool part ${base.name} has no object input`, 'internal');
  }
  return base.input;
}

export function adapted(base: Tool, adapter: Adapter): Tool {
  const input = adapter.input(objectInput(base));
  const prepared = (context: ToolContext, raw: Args): Args =>
    adapter.prepare === undefined ? raw : adapter.prepare(context, raw);
  const mapped = (context: ToolContext, parsed: Args): Args =>
    adapter.args === undefined ? parsed : adapter.args(context, parsed);
  return {
    ...base,
    input,
    listing: { ...base.listing, inputSchema: jsonSchemaOf(input, 'input') },
    check: (context, raw): string | null => {
      try {
        const ready = prepared(context, raw);
        const issues = argumentIssues(input, ready);
        if (issues !== null || adapter.run !== undefined) return issues;
        return base.check(context, mapped(context, validArguments(input, ready)));
      } catch (cause) {
        if (cause instanceof ToolError) return cause.message;
        throw cause;
      }
    },
    call: (context, raw): Promise<ToolOutput> => {
      const parsed = validArguments(input, prepared(context, raw));
      return adapter.run === undefined
        ? base.call(context, mapped(context, parsed))
        : adapter.run(context, parsed, base);
    },
  };
}

const ADAPTERS: Readonly<Partial<Record<McpPartName, Adapter>>> = {
  ...AUTOMATION_ADAPTERS,
  ...LIFE_ADAPTERS,
};

export function withAdapter(name: McpPartName, base: Tool): Tool {
  const adapter = ADAPTERS[name];
  return adapter === undefined ? base : adapted(base, adapter);
}
