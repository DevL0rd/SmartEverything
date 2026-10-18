import { previewCaptureImage } from './preview-capture-image';
import {
  API_ENDPOINTS,
  MCP_HUMAN_ONLY_OPERATIONS,
  MCP_UNAVAILABLE_OPERATIONS,
  MCP_OPERATION_TOOLS,
  MCP_TOOL_AREAS,
  endpointAccessArea,
  mcpOperationArea,
  mcpOperationTraits,
  type EndpointName,
  type McpPartName,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { OperationInput } from '../../../server/operations';
import { operate } from './acting';
import { areaRefusal, reachableAreas } from './person-reach';
import { operationNamed } from './operation-names';
import {
  ACTING_FIELD,
  CALLABLE_OPERATIONS,
  isEndpointName,
  operationInput,
  operationShape,
  type OperationShape,
} from './operation-shape';
import {
  PERSON,
  READS,
  ToolError,
  combinedAnnotations,
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
  validArguments,
} from './registry';

const PERSON_ID = z.uuid().optional();

function inputOf(shape: OperationShape, args: Readonly<Record<string, unknown>>): OperationInput {
  const input = operationInput(shape, args);
  const { [ACTING_FIELD]: acting, ...rest } = args;
  validArguments(shape.input, shape.acting ? { ...rest, [ACTING_FIELD]: acting } : rest);
  return input;
}

async function called(
  context: ToolContext,
  shape: OperationShape,
  args: Readonly<Record<string, unknown>>,
): Promise<ToolOutput> {
  const personId = shape.acting ? PERSON_ID.parse(args[ACTING_FIELD]) : undefined;
  const result = await operate(context, shape.name, inputOf(shape, args), { personId });
  if (mcpOperationTraits(shape.name).returnsImage === true) {
    return previewCaptureImage(context, result);
  }
  return { structured: { result: result ?? null }, action: reports(shape) };
}

function reports(shape: OperationShape): boolean {
  return (
    !annotationsFor(shape.name).readOnlyHint && mcpOperationTraits(shape.name).answers !== true
  );
}

function annotationsByMethod(name: EndpointName): ToolAnnotations {
  switch (API_ENDPOINTS[name].method) {
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

function annotationsFor(name: EndpointName): ToolAnnotations {
  return { ...annotationsByMethod(name), ...mcpOperationTraits(name).hints };
}

export function operationTool(name: McpPartName, operation: EndpointName): Tool {
  const shape = operationShape(operation);
  return {
    name,
    input: shape.input,
    listing: listingOf(name, jsonSchemaOf(shape.input, 'input'), annotationsFor(operation)),
    call: (context, args) => called(context, shape, args),
    check: (context, args): string | null => {
      if (!PERSON_ID.safeParse(args[ACTING_FIELD]).success) {
        return 'personId must be a person id from list_people';
      }
      return context.operations.check(shape.name, inputOf(shape, args));
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
    .optional()
    .describe(
      'Give the input JSON schema of these operations, named as in the listing (camelCase, such as listClaudeSessions)',
    ),
  responses: z.boolean().default(false).describe('Also give their response JSON schemas'),
});

function availableOperation(asked: string): EndpointName {
  const name = operationNamed(asked);
  const reason = MCP_UNAVAILABLE_OPERATIONS[name];
  if (reason !== undefined)
    throw new ToolError(`${name} is unavailable to AI: ${reason}`, 'unsupported_operation');
  return name;
}

function operationInScope(context: ToolContext, shape: OperationShape): boolean {
  const areas = reachableAreas(context);
  const area = endpointAccessArea(shape.endpoint);
  return areas === undefined || area === null || areas.includes(area);
}

function detailed(
  context: ToolContext,
  asked: string,
  responses: boolean,
): Record<string, unknown> {
  const name = availableOperation(asked);
  const shape = operationShape(name);
  if (!operationInScope(context, shape)) {
    throw areaRefusal(context, name, mcpOperationArea(shape.endpoint));
  }
  return {
    ...listed(name),
    annotations: annotationsFor(name),
    input: jsonSchemaOf(shape.input, 'input'),
    ...(responses ? { response: jsonSchemaOf(shape.endpoint.response, 'output') } : {}),
  };
}

function operationsListed(
  context: ToolContext,
  input: z.infer<typeof LIST>,
): Record<string, unknown> {
  if (input.operations !== undefined) {
    return { operations: input.operations.map((name) => detailed(context, name, input.responses)) };
  }
  const search = input.search;
  return {
    operations: Object.keys(MCP_HUMAN_ONLY_OPERATIONS)
      .filter(isEndpointName)
      .filter((name) => MCP_UNAVAILABLE_OPERATIONS[name] === undefined)
      .concat(CALLABLE_OPERATIONS)
      .filter((name) => operationInScope(context, operationShape(name)))
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
  personId: PERSON,
});

function callable(asked: string): EndpointName {
  const name = availableOperation(asked);
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
    run: (context, input) => ({ structured: operationsListed(context, input) }),
  }),
  defineTool({
    name: 'call_operation',
    input: CALL,
    annotations: combinedAnnotations(CALLABLE_OPERATIONS.map(annotationsFor)),
    run: (context, input) =>
      called(context, operationShape(callable(input.operation)), {
        ...input.arguments,
        ...(input.personId === undefined ? {} : { personId: input.personId }),
      }),
  }),
  ...MCP_OPERATION_TOOLS.map(([name, operation]) => operationTool(name, operation)),
];
