import {
  MCP_PART_TEXTS,
  MCP_TOOLS,
  type McpRoute,
  type McpToolName,
} from '@smarteverything/domain';
import { z } from 'zod';
import { ToolError, type Tool, type ToolAnnotations, type ToolOutput } from './registry';

type Args = Readonly<Record<string, unknown>>;

type Routed = Extract<McpRoute, { readonly key: string }>;

const LISTED = z.looseObject({
  inputSchema: z.looseObject({
    properties: z.record(z.string(), z.unknown()).default({}),
    required: z.array(z.string()).default([]),
  }),
  annotations: z.looseObject({
    readOnlyHint: z.boolean(),
    destructiveHint: z.boolean(),
    idempotentHint: z.boolean(),
    openWorldHint: z.boolean(),
  }),
});

export interface PartCall {
  readonly name: string;
  readonly args: Args;
}

function listedOf(tool: Tool): z.infer<typeof LISTED> {
  return LISTED.parse(tool.listing);
}

function textOf(name: McpToolName): (typeof MCP_TOOLS)[number] {
  const text = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (text === undefined) {
    throw new ToolError(`The tool ${name} has no text in MCP_TOOLS`, 'internal');
  }
  return text;
}

function firstSentence(name: string): string {
  const text = MCP_PART_TEXTS.find((candidate) => candidate.name === name)?.description ?? '';
  return (text.split(/(?<=\.)\s/)[0] ?? text).replace(/\.$/, '');
}

function merged(parts: readonly Tool[]): ToolAnnotations {
  const all = parts.map((part) => listedOf(part).annotations);
  return {
    readOnlyHint: all.every((one) => one.readOnlyHint),
    destructiveHint: all.some((one) => one.destructiveHint),
    idempotentHint: all.every((one) => one.idempotentHint),
    openWorldHint: all.some((one) => one.openWorldHint),
  };
}

export function servedListing(
  name: McpToolName,
  inputSchema: Args,
  annotations: ToolAnnotations,
): Args {
  const text = textOf(name);
  return {
    name,
    title: text.title,
    description: text.description,
    inputSchema,
    annotations: { title: text.title, ...annotations },
  };
}

interface PartFields {
  readonly value: string;
  readonly part: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly required: readonly string[];
}

function partFields(route: Routed, parts: ReadonlyMap<string, Tool>): readonly PartFields[] {
  return Object.entries(route.parts).map(([value, part]) => {
    const tool = parts.get(part);
    const schema = tool === undefined ? null : listedOf(tool).inputSchema;
    return {
      value,
      part,
      properties: schema?.properties ?? {},
      required: schema?.required ?? [],
    };
  });
}

function fieldsText(fields: PartFields): string {
  const names = Object.keys(fields.properties).map((field) =>
    fields.required.includes(field) ? `${field} (required)` : field,
  );
  return names.length === 0 ? 'no other fields' : `fields: ${names.join(', ')}`;
}

function keySchema(route: Routed, all: readonly PartFields[]): Args {
  const lines = all.map(
    (fields) => `${fields.value}: ${firstSentence(fields.part)} (${fieldsText(fields)})`,
  );
  return {
    type: 'string',
    enum: Object.keys(route.parts),
    description: `${lines.join('; ')}. Send only the fields of the chosen ${route.key}.`,
  };
}

const FIELD_SHAPE = z.looseObject({
  format: z.string().optional(),
  description: z.string().optional(),
});

const FORMAT_TEXT: Readonly<Record<string, string>> = {
  date: 'a day, YYYY-MM-DD',
  'date-time': 'a moment, ISO 8601 with time zone',
};

function shapeOf(schema: unknown): string {
  const parsed = FIELD_SHAPE.safeParse(schema);
  const format = parsed.success ? parsed.data.format : undefined;
  const known = format === undefined ? undefined : FORMAT_TEXT[format];
  return known ?? (parsed.success ? (parsed.data.description ?? '') : '');
}

function mergedField(uses: readonly (readonly [string, unknown])[]): unknown {
  const distinct = [
    ...new Map(uses.map(([, schema]) => [JSON.stringify(schema), schema])).values(),
  ];
  if (distinct.length === 1) {
    return distinct[0];
  }
  const groups = new Map<string, string[]>();
  for (const [value, schema] of uses) {
    const shape = shapeOf(schema);
    groups.set(shape, [...(groups.get(shape) ?? []), value]);
  }
  const lines = [...groups].map(([shape, values]) => `${values.join(', ')}: ${shape}`);
  return { anyOf: distinct, description: lines.join('; ') };
}

function routedSchema(route: Routed, parts: ReadonlyMap<string, Tool>): Args {
  const all = partFields(route, parts);
  const uses = new Map<string, (readonly [string, unknown])[]>();
  for (const fields of all) {
    for (const [field, schema] of Object.entries(fields.properties)) {
      uses.set(field, [...(uses.get(field) ?? []), [fields.value, schema]]);
    }
  }
  const properties = Object.fromEntries(
    [...uses].map(([field, used]) => [field, mergedField(used)]),
  );
  return {
    type: 'object',
    properties: { [route.key]: keySchema(route, all), ...properties },
    required: [route.key],
    additionalProperties: false,
  };
}

export function partCall(route: McpRoute, name: string, args: Args): PartCall {
  if ('part' in route) {
    return { name: route.part, args };
  }
  if (!('key' in route)) {
    return { name, args };
  }
  const value = args[route.key];
  const part = typeof value === 'string' ? route.parts[value] : undefined;
  if (part === undefined) {
    const allowed = Object.keys(route.parts).join(', ');
    throw new ToolError(`${route.key} must be one of: ${allowed}`);
  }
  return {
    name: part,
    args: Object.fromEntries(Object.entries(args).filter(([field]) => field !== route.key)),
  };
}

function partNamed(parts: ReadonlyMap<string, Tool>, name: string): Tool {
  const part = parts.get(name);
  if (part === undefined) {
    throw new ToolError(`The tool part ${name} does not exist`, 'internal');
  }
  return part;
}

function routedTool(name: McpToolName, route: Routed, parts: ReadonlyMap<string, Tool>): Tool {
  const members = Object.values(route.parts).map((part) => partNamed(parts, part));
  const resolve = (args: Args): { tool: Tool; args: Args } => {
    const call = partCall(route, name, args);
    return { tool: partNamed(parts, call.name), args: call.args };
  };
  return {
    name,
    listing: servedListing(name, routedSchema(route, parts), merged(members)),
    confirms: (args): boolean => {
      const call = partCall(route, name, args);
      return partNamed(parts, call.name).confirms(call.args);
    },
    check: (context, args): string | null => {
      try {
        const found = resolve(args);
        return found.tool.check(context, found.args);
      } catch (cause) {
        return cause instanceof Error ? cause.message : 'The arguments are not valid';
      }
    },
    call: (context, args): Promise<ToolOutput> => {
      const found = resolve(args);
      return found.tool.call(context, found.args);
    },
  };
}

function renamed(name: McpToolName, part: Tool): Tool {
  const listed = listedOf(part);
  return { ...part, name, listing: servedListing(name, listed.inputSchema, listed.annotations) };
}

function composed(name: McpToolName, members: readonly Tool[]): Tool {
  return {
    name,
    listing: servedListing(
      name,
      { type: 'object', properties: {}, additionalProperties: false },
      merged(members),
    ),
    confirms: (): boolean => false,
    check: (): string | null => null,
    call: async (context): Promise<ToolOutput> => {
      const outputs = await Promise.all(members.map((member) => member.call(context, {})));
      return {
        structured: outputs.reduce<Args>((all, output) => ({ ...all, ...output.structured }), {}),
      };
    },
  };
}

export function servedTool(
  name: McpToolName,
  route: McpRoute,
  parts: ReadonlyMap<string, Tool>,
  custom: ReadonlyMap<string, Tool>,
): Tool {
  if ('part' in route) {
    return renamed(name, partNamed(parts, route.part));
  }
  if ('key' in route) {
    return routedTool(name, route, parts);
  }
  if ('compose' in route) {
    return composed(
      name,
      route.compose.map((part) => partNamed(parts, part)),
    );
  }
  return partNamed(custom, name);
}
