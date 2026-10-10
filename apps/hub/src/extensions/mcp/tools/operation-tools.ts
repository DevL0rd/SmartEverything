import {
  MCP_HUMAN_ONLY_OPERATIONS,
  MCP_OPERATION_TOOLS,
  MCP_TOOL_AREAS,
  mcpOperationArea,
  type EndpointName,
  type McpPartName,
} from '@smarteverything/domain';
import { z } from 'zod';
import { operate } from './acting';
import { operationNamed } from './operation-names';
import {
  CALLABLE_OPERATIONS,
  isEndpointName,
  operationInput,
  operationShape,
  type OperationShape,
} from './operation-shape';
import {
  PROFILE,
  READS,
  ToolError,
  REMOVES,
  WRITES,
  defineTool,
  jsonSchemaOf,
  listingOf,
  matches,
  type Tool,
  type ToolAnnotations,
  type ToolContext,
  type ToolOutput,
} from './registry';

const PROFILE_ID = z.uuid().optional();

async function called(
  context: ToolContext,
  shape: OperationShape,
  args: Readonly<Record<string, unknown>>,
): Promise<ToolOutput> {
  const profileId = PROFILE_ID.parse(args['profileId']);
  const result = await operate(context, shape.name, operationInput(shape, args), { profileId });
  return { structured: { result: result ?? null } };
}

function annotationsOf(shape: OperationShape): ToolAnnotations {
  switch (shape.endpoint.method) {
    case 'GET':
      return READS;
    case 'DELETE':
      return REMOVES;
    case 'PUT':
      return { ...WRITES, idempotentHint: true };
    case 'POST':
    case 'PATCH':
      return WRITES;
  }
}

export function operationTool(name: McpPartName, operation: EndpointName): Tool {
  const shape = operationShape(operation);
  return {
    name,
    listing: listingOf(name, shape.input, annotationsOf(shape)),
    call: (context, args) => called(context, shape, args),
    check: (context, args): string | null => {
      const profileId = PROFILE_ID.safeParse(args['profileId']);
      if (!profileId.success) {
        return 'profileId must be a person id from list_people';
      }
      return context.operations.check(shape.name, operationInput(shape, args));
    },
  };
}

const DEDICATED: ReadonlyMap<string, string> = new Map(
  MCP_OPERATION_TOOLS.map(([tool, operation]) => [operation, tool]),
);

function listed(name: EndpointName): Record<string, unknown> {
  const shape = operationShape(name);
  return {
    name,
    tool: DEDICATED.get(name) ?? 'call_operation',
    method: shape.endpoint.method,
    path: shape.endpoint.path,
    access: shape.endpoint.access,
    area: mcpOperationArea(shape.endpoint),
    summary: shape.endpoint.summary,
    human_only: MCP_HUMAN_ONLY_OPERATIONS[name] ?? null,
  };
}

const LIST = z.strictObject({
  area: z.enum(MCP_TOOL_AREAS).optional(),
  search: z.string().min(1).max(100).optional().describe('Words in the name, path or summary'),
  operations: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Give the input JSON schema of these operations, named as in the listing (camelCase, such as listClaudeSessions)',
    ),
  responses: z.boolean().default(false).describe('Also give their response JSON schemas'),
});

function detailed(asked: string, responses: boolean): Record<string, unknown> {
  const name = operationNamed(asked);
  const shape = operationShape(name);
  return {
    ...listed(name),
    input: shape.input,
    ...(responses ? { response: jsonSchemaOf(shape.endpoint.response, 'output') } : {}),
  };
}

function operationsListed(input: z.infer<typeof LIST>): Record<string, unknown> {
  if (input.operations !== undefined) {
    return { operations: input.operations.map((name) => detailed(name, input.responses)) };
  }
  const search = input.search;
  return {
    operations: Object.keys(MCP_HUMAN_ONLY_OPERATIONS)
      .filter(isEndpointName)
      .concat(CALLABLE_OPERATIONS)
      .map(listed)
      .filter(
        (entry) =>
          (input.area === undefined || entry['area'] === input.area) &&
          (search === undefined ||
            matches(
              search,
              String(entry['name']),
              String(entry['path']),
              String(entry['summary']),
            )),
      ),
  };
}

const CALL = z.strictObject({
  operation: z
    .string()
    .min(1)
    .describe('An operation name from list_operations, camelCase such as listClaudeSessions'),
  arguments: z
    .record(z.string(), z.unknown())
    .default({})
    .describe(
      'Path parameters, query and body fields as list_operations gives them; a field it shows as body goes under a body key',
    ),
  profileId: PROFILE,
});

function callable(asked: string): EndpointName {
  const name = operationNamed(asked);
  const reason = MCP_HUMAN_ONLY_OPERATIONS[name];
  if (reason !== undefined) {
    throw new ToolError(`${name} stays with the person: ${reason}`, 'human_only');
  }
  return name;
}

export const OPERATION_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'list_operations',
    input: LIST,
    annotations: READS,
    run: (_context, input) => ({ structured: operationsListed(input) }),
  }),
  defineTool({
    name: 'call_operation',
    input: CALL,
    annotations: { ...WRITES, destructiveHint: true, openWorldHint: true },
    run: (context, input) =>
      called(context, operationShape(callable(input.operation)), {
        ...input.arguments,
        ...(input.profileId === undefined ? {} : { profileId: input.profileId }),
      }),
  }),
  ...MCP_OPERATION_TOOLS.map(([name, operation]) => operationTool(name, operation)),
];
