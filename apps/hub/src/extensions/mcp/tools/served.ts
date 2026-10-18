import {
  appendTo,
  MCP_PART_TEXTS,
  MCP_TOOLS,
  isAdminOperation,
  mcpToolLine,
  mcpToolOperation,
  type McpRoute,
  type McpToolName,
} from '@smarteverything/domain';
import { z } from 'zod';
import {
  ToolError,
  argumentIssues,
  combinedAnnotations,
  inlineSchemaOf,
  jsonSchemaOf,
  validArguments,
  type Tool,
  type ToolAnnotations,
  type ToolListing,
  type ToolOutput,
} from './registry';
import { withoutDefault } from './computer-flat';

type Args = Readonly<Record<string, unknown>>;

type Routed = Extract<McpRoute, { readonly key: string }>;

const NO_ARGUMENTS = z.strictObject({});

export interface PartCall {
  readonly name: string;
  readonly args: Args;
}

function textOf(name: McpToolName): (typeof MCP_TOOLS)[number] {
  const text = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (text === undefined) {
    throw new ToolError(`The tool ${name} has no text in MCP_TOOLS`, 'internal');
  }
  return text;
}

function firstSentence(name: string): string {
  return mcpToolLine(
    MCP_PART_TEXTS.find((candidate) => candidate.name === name)?.description ?? '',
  );
}

function annotationsOf(members: readonly Tool[]): ToolAnnotations {
  return combinedAnnotations(members.map((member) => member.listing.annotations));
}

export function servedListing(
  name: McpToolName,
  inputSchema: Args,
  annotations: ToolAnnotations,
): ToolListing {
  const text = textOf(name);
  return {
    name,
    title: text.title,
    description: text.description,
    inputSchema,
    annotations: { title: text.title, ...annotations },
  };
}

type Shape = Readonly<Record<string, z.core.$ZodType>>;

interface Branch {
  readonly value: string;
  readonly part: Tool;
  readonly shape: Shape;
  readonly required: readonly string[];
  readonly schema: Args;
}

const REQUIRED = z.looseObject({ required: z.array(z.string()).default([]) });

function shapeOf(part: Tool): Shape {
  if (!(part.input instanceof z.ZodObject)) {
    throw new ToolError(`The tool part ${part.name} has no object input`, 'internal');
  }
  return part.input.shape;
}

function branchOf(route: Routed, value: string, part: Tool): Branch {
  const shape = shapeOf(part);
  const schema = jsonSchemaOf(z.strictObject({ [route.key]: z.literal(value), ...shape }), 'input');
  const required = REQUIRED.parse(schema).required.filter((field) => field !== route.key);
  return { value, part, shape, required, schema };
}

function spoken(identifier: string): string {
  return identifier.replaceAll('_', ' ');
}

function fieldsText(branch: Branch): string {
  const names = Object.keys(branch.shape).map((field) =>
    branch.required.includes(field) ? `${spoken(field)} (required)` : spoken(field),
  );
  return names.length === 0 ? 'no other fields' : `fields: ${names.join(', ')}`;
}

function adminNote(part: string): string {
  const operation = mcpToolOperation(part);
  return operation !== undefined && isAdminOperation(operation)
    ? ', not available to a plugin’s request'
    : '';
}

function keyText(route: Routed, branches: readonly Branch[]): string {
  const lines = branches.map(
    (branch) =>
      `${spoken(branch.value)}: ${route.says?.[branch.value] ?? firstSentence(branch.part.name)}${adminNote(branch.part.name)} (${fieldsText(branch)})`,
  );
  return `${lines.join('; ')}. Send only the fields of the chosen ${route.key}.`;
}

const FIELD_SHAPE = z.looseObject({
  format: z.string().optional(),
  description: z.string().optional(),
});

const FORMAT_TEXT: Readonly<Record<string, string>> = {
  date: 'a day, YYYY-MM-DD',
  'date-time': 'a moment, ISO 8601 with time zone',
};

interface Use {
  readonly value: string;
  readonly field: z.core.$ZodType;
  readonly json: string;
  readonly meaning: string;
  readonly shape: string;
  readonly described: boolean;
}

function useOf(value: string, field: z.core.$ZodType): Use {
  const json = FIELD_SHAPE.parse(inlineSchemaOf(field, 'input'));
  const format = json.format === undefined ? undefined : FORMAT_TEXT[json.format];
  const { default: _default, description: _description, ...meaning } = json;
  return {
    value,
    field,
    json: JSON.stringify(json),
    meaning: JSON.stringify(meaning),
    shape: format ?? json.description ?? '',
    described: json.description !== undefined,
  };
}

function groupedBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    appendTo(groups, key, item);
  }
  return groups;
}

function mergedField(uses: readonly Use[]): z.ZodType {
  const distinct = [...groupedBy(uses, (use) => use.meaning).values()].flatMap(
    (group) => group.findLast((use) => use.described) ?? group.slice(-1),
  );
  const [only, ...others] = distinct;
  if (only === undefined) {
    throw new ToolError('A routed field has no use', 'internal');
  }
  if (others.length === 0) {
    const same = uses.every((use) => use.json === only.json);
    return z.optional(same ? only.field : withoutDefault(only.field));
  }
  const lines = [...groupedBy(uses, (use) => use.shape)]
    .filter(([shape]) => shape !== '')
    .map(([shape, group]) => `${group.map((use) => use.value).join(', ')}: ${shape}`);
  const union = z.union(distinct.map((use) => withoutDefault(use.field)));
  return z.optional(lines.length === 0 ? union : union.describe(lines.join('; ')));
}

function routedInput(route: Routed, branches: readonly Branch[]): z.ZodType {
  const uses = new Map<string, Use[]>();
  for (const branch of branches) {
    for (const [field, schema] of Object.entries(branch.shape)) {
      appendTo(uses, field, useOf(branch.value, schema));
    }
  }
  return z.strictObject({
    [route.key]: z.enum(Object.keys(route.parts)).describe(keyText(route, branches)),
    ...Object.fromEntries([...uses].map(([field, used]) => [field, mergedField(used)])),
  });
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

function refusedFields(route: Routed, branch: Branch, args: Args): void {
  const extras = Object.keys(args).filter((field) => !(field in branch.shape));
  if (extras.length > 0) {
    throw new ToolError(
      `${route.key} ${branch.value} does not take ${extras.join(', ')}; it takes ${fieldsText(branch)}`,
    );
  }
}

function routedTool(name: McpToolName, route: Routed, parts: ReadonlyMap<string, Tool>): Tool {
  const branches = Object.entries(route.parts).map(([value, part]) =>
    branchOf(route, value, partNamed(parts, part)),
  );
  const branchOfPart = new Map(branches.map((branch) => [branch.part.name, branch]));
  const resolve = (args: Args): { tool: Tool; args: Args } => {
    const call = partCall(route, name, args);
    const branch = branchOfPart.get(call.name);
    if (branch !== undefined) {
      refusedFields(route, branch, call.args);
    }
    return { tool: partNamed(parts, call.name), args: call.args };
  };
  return {
    name,
    listing: servedListing(
      name,
      jsonSchemaOf(routedInput(route, branches), 'input'),
      annotationsOf(branches.map((branch) => branch.part)),
    ),
    variants: new Map(
      branches.map((branch) => [
        branch.value,
        {
          selector: { [route.key]: branch.value },
          inputSchema: branch.schema,
          annotations: branch.part.listing.annotations,
        },
      ]),
    ),
    check: (context, args): string | null => {
      try {
        const found = resolve(args);
        return found.tool.check(context, found.args);
      } catch (cause) {
        if (cause instanceof Error) {
          return cause.message;
        }
        throw cause;
      }
    },
    call: (context, args): Promise<ToolOutput> => {
      const found = resolve(args);
      return found.tool.call(context, found.args);
    },
  };
}

function renamed(name: McpToolName, part: Tool): Tool {
  const { inputSchema, annotations } = part.listing;
  return { ...part, name, listing: servedListing(name, inputSchema, annotations) };
}

function composed(name: McpToolName, members: readonly Tool[]): Tool {
  return {
    name,
    input: NO_ARGUMENTS,
    listing: servedListing(name, jsonSchemaOf(NO_ARGUMENTS, 'input'), annotationsOf(members)),
    check: (_context, args): string | null => argumentIssues(NO_ARGUMENTS, args),
    call: async (context, args): Promise<ToolOutput> => {
      validArguments(NO_ARGUMENTS, args);
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
