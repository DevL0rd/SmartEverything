import {
  MCP_HUMAN_ONLY_OPERATIONS,
  MCP_OPERATION_TOOLS,
  mcpOperationTraits,
  type EndpointName,
  type McpPartName,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { OperationInput } from '../../../server/operations';
import { newImageOperationId } from '../../../assistant/image/call-operation';
import { operate } from './acting';
import { withAdapter } from './adapters';
import { computerIdOf } from './computer-target';
import { checkedFields, filledFields, hiddenFields, shapedFields } from './part-fields';
import { REFERENCE_FIELDS, referenceField, resolveReferences } from './references';
import { availableOperation, operationAnnotations } from './operation-details';
import {
  ACTING_FIELD,
  CALLABLE_OPERATIONS,
  CHAT_FIELD,
  operationInput,
  operationShape,
  type OperationShape,
} from './operation-shape';
import {
  PERSON,
  ToolError,
  combinedAnnotations,
  defineTool,
  jsonSchemaOf,
  listingOf,
  type Tool,
  type ToolContext,
  type ToolOutput,
  validArguments,
} from './registry';

const PERSON_ID = z.uuid().optional();

function withCallIdentity(
  context: Pick<ToolContext, 'actor'>,
  shape: OperationShape,
  input: OperationInput,
): OperationInput {
  const field = mcpOperationTraits(shape.name).callIdentity;
  if (field === undefined) {
    return input;
  }
  const body = BODY_RECORD.parse(input.body);
  return { ...input, body: { ...body, [field]: newImageOperationId(context.actor?.callId) } };
}

const BODY_RECORD = z.record(z.string(), z.unknown());

function takesChat(shape: OperationShape): boolean {
  return [...shape.params, ...shape.query, ...(shape.flatBody ?? [])].includes(CHAT_FIELD);
}

export function withCallingChat(
  context: Pick<ToolContext, 'actor'>,
  shape: OperationShape,
  args: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!takesChat(shape) || args[CHAT_FIELD] !== undefined) {
    return args;
  }
  const chatId = context.actor?.chatId ?? null;
  if (chatId === null) {
    throw new ToolError(
      `${CHAT_FIELD} is needed when this is not called from a chat; chat_read gives the chat ids`,
    );
  }
  return { ...args, [CHAT_FIELD]: chatId };
}

export function withComputer(
  context: Pick<ToolContext, 'store' | 'actor' | 'caller'>,
  shape: OperationShape,
  args: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!shape.computer) {
    return args;
  }
  const wanted = args['deviceId'];
  return {
    ...args,
    deviceId: computerIdOf(context, typeof wanted === 'string' ? wanted : undefined),
  };
}

function inputOf(shape: OperationShape, args: Readonly<Record<string, unknown>>): OperationInput {
  const input = operationInput(shape, args);
  const { [ACTING_FIELD]: _acting, ...rest } = args;
  validArguments(shape.input, Object.hasOwn(shape.input.shape, ACTING_FIELD) ? args : rest);
  return input;
}

async function called(
  context: ToolContext,
  shape: OperationShape,
  args: Readonly<Record<string, unknown>>,
): Promise<ToolOutput> {
  const personId = shape.acting ? PERSON_ID.parse(args[ACTING_FIELD]) : undefined;
  const input = withCallIdentity(context, shape, inputOf(shape, args));
  const result = await operate(context, shape.name, input, { personId });
  return { structured: { result: result ?? null }, action: reports(shape) };
}

function reports(shape: OperationShape): boolean {
  return (
    !operationAnnotations(shape.name).readOnlyHint &&
    mcpOperationTraits(shape.name).answers !== true
  );
}

const HIDDEN_FIELDS: Readonly<Partial<Record<McpPartName, readonly string[]>>> = {
  update_camera: ['wakeSensitivity', 'transcribe'],
};

function listedInput(name: McpPartName, shape: OperationShape): z.ZodObject {
  const hidden = [...(HIDDEN_FIELDS[name] ?? []), ...hiddenFields(name)];
  const kept = shapedFields(
    name,
    Object.fromEntries(
      Object.entries(shape.input.shape).filter(([field]) => !hidden.includes(field)),
    ),
  );
  const references = (REFERENCE_FIELDS[name] ?? []).filter((field) => field in kept);
  return z.strictObject({
    ...kept,
    ...Object.fromEntries(
      references.map((field) => {
        const original = shape.input.shape[field];
        return [
          field,
          referenceField(
            field,
            original?.safeParse(undefined).success === true,
            original?.safeParse(null).success === true,
          ),
        ];
      }),
    ),
  });
}

function shownFields(name: McpPartName, args: Readonly<Record<string, unknown>>): void {
  const hidden = (HIDDEN_FIELDS[name] ?? []).filter((field) => args[field] !== undefined);
  if (hidden.length > 0) {
    throw new ToolError(`${name} does not take ${hidden.join(', ')}; listening_edit changes them`);
  }
}

export function operationTool(name: McpPartName, operation: EndpointName): Tool {
  const shape = operationShape(operation);
  const input = listedInput(name, shape);
  const prepared = (
    context: ToolContext,
    args: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> => {
    shownFields(name, args);
    checkedFields(name, args);
    return withCallingChat(
      context,
      shape,
      filledFields(name, context, resolveReferences(context, REFERENCE_FIELDS[name], args)),
    );
  };
  return {
    name,
    input,
    listing: listingOf(name, jsonSchemaOf(input, 'input'), operationAnnotations(operation)),
    call: (context, args) => called(context, shape, prepared(context, args)),
    check: (context, args): string | null => {
      try {
        const resolved = prepared(context, args);
        if (!PERSON_ID.safeParse(resolved[ACTING_FIELD]).success) {
          return 'personId must be a person name or id from person_read';
        }
        return context.operations.check(shape.name, inputOf(shape, resolved));
      } catch (cause) {
        if (cause instanceof ToolError) return cause.message;
        throw cause;
      }
    },
  };
}

const CALL = z.strictObject({
  operation: z
    .string()
    .min(1)
    .describe('An operation name from tool_search, camelCase such as listClaudeSessions'),
  arguments: z
    .record(z.string(), z.unknown())
    .default({})
    .describe(
      'Path parameters, query and body fields as tool_read shows them; a field it shows as body goes under a body key',
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
    name: 'operation_call',
    input: CALL,
    annotations: combinedAnnotations(CALLABLE_OPERATIONS.map(operationAnnotations)),
    run: (context, input) => {
      const shape = operationShape(callable(input.operation));
      return called(
        context,
        shape,
        withComputer(context, shape, {
          ...input.arguments,
          ...(input.personId === undefined ? {} : { personId: input.personId }),
        }),
      );
    },
  }),
  ...MCP_OPERATION_TOOLS.map(([name, operation]) =>
    withAdapter(name, operationTool(name, operation)),
  ),
];
