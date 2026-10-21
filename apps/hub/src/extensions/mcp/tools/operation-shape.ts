import {
  API_ENDPOINTS,
  MCP_UNAVAILABLE_OPERATIONS,
  NO_BODY,
  QUERY_FLAG,
  isHumanOnlyOperation,
  mcpOperationArea,
  mcpOperationTraits,
  type EndpointName,
  type EndpointShape,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { OperationInput } from '../../../server/operations';
import { COMPUTER_ID } from './computer-target';
import { ToolError } from './registry';

type Fields = Readonly<Record<string, z.ZodType>>;

const PERSONAL_AREAS: ReadonlySet<string> = new Set(['health', 'nutrition', 'people', 'settings']);

const BODY_FIELD = 'body';

export const ACTING_FIELD = 'personId';

const PERSON_FIELD = z.uuid().optional().describe('Whose data; the owner’s profile when left out');

const TOOL_FIELDS: Readonly<Record<string, string>> = {
  profileId: 'personId',
  cameraId: 'deviceId',
};

export interface OperationShape {
  readonly name: EndpointName;
  readonly endpoint: EndpointShape;
  readonly params: readonly string[];
  readonly query: readonly string[];
  readonly flatBody: readonly string[] | null;
  readonly acting: boolean;
  readonly computer: boolean;
  readonly fromTool: Readonly<Record<string, string>>;
  readonly input: z.ZodObject;
}

function objectOf(schema: z.core.$ZodType): z.ZodObject | null {
  if (schema instanceof z.ZodObject) {
    return schema;
  }
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional) {
    return objectOf(schema.unwrap());
  }
  return null;
}

function fieldsOf(schema: z.ZodType): Fields {
  const object = objectOf(schema);
  return object === null
    ? {}
    : Object.fromEntries(
        Object.entries(object.shape).filter(
          (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
        ),
      );
}

function flatBodyOf(endpoint: EndpointShape, taken: readonly string[]): Fields | null {
  if (endpoint.body === NO_BODY || objectOf(endpoint.body) === null) {
    return null;
  }
  const fields = fieldsOf(endpoint.body);
  return Object.keys(fields).some((key) => taken.includes(key)) ? null : fields;
}

function bodyFieldsOf(endpoint: EndpointShape, flat: Fields | null): Fields {
  if (flat !== null) {
    return flat;
  }
  return endpoint.body === NO_BODY ? {} : { body: endpoint.body };
}

const SHAPES = new Map<EndpointName, OperationShape>();

export function operationShape(name: EndpointName): OperationShape {
  const known = SHAPES.get(name);
  if (known !== undefined) {
    return known;
  }
  const shape = shapeOf(name);
  SHAPES.set(name, shape);
  return shape;
}

function surfaced(fields: Fields, renames: Readonly<Record<string, string>>): Fields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, schema]) => [renames[key] ?? key, schema]),
  );
}

function camelCaseOf(key: string): string {
  return key.replace(/_([a-z0-9])/gu, (_match, letter: string) => letter.toUpperCase());
}

function toolKeyOf(key: string): string {
  return TOOL_FIELDS[key] ?? camelCaseOf(key);
}

function renamesOf(keys: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const tool = toolKeyOf(key);
      return tool === key || keys.includes(tool) ? [] : [[key, tool]];
    }),
  );
}

const COMPUTER_PATH = '/api/computers/:deviceId';

export const CHAT_FIELD = 'chatId';

const CHAT_DEFAULT = 'The chat; the calling chat when left out (chat_read gives other chat ids)';

function listItemOf(schema: z.ZodType): z.ZodType | null {
  const optional = schema instanceof z.ZodOptional;
  const inner = optional ? schema.unwrap() : schema;
  if (
    inner instanceof z.ZodPipe &&
    inner.in instanceof z.ZodPipe &&
    inner.out instanceof z.ZodArray &&
    inner.out.element instanceof z.ZodType
  ) {
    const list = z.array(inner.out.element).min(1);
    return optional ? list.optional() : list;
  }
  return null;
}

function toolField(key: string, schema: z.ZodType, query: boolean): z.ZodType {
  if (key === CHAT_FIELD) {
    return schema.optional().describe(CHAT_DEFAULT);
  }
  const list = query ? listItemOf(schema) : null;
  if (list !== null) {
    return list;
  }
  if (query && isQueryFlag(schema)) {
    return schema instanceof z.ZodOptional || schema instanceof z.ZodDefault
      ? z.boolean().optional()
      : z.boolean();
  }
  return schema;
}

const FLAG_WORDS = ['true', 'false'];

function isQueryFlag(schema: z.ZodType): boolean {
  const inner =
    schema instanceof z.ZodOptional || schema instanceof z.ZodDefault ? schema.unwrap() : schema;
  return (
    inner === QUERY_FLAG ||
    (inner instanceof z.ZodEnum &&
      inner.options.length === FLAG_WORDS.length &&
      inner.options.every((option) => FLAG_WORDS.includes(String(option))))
  );
}

function toolFields(fields: Fields, query: boolean): Fields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, schema]) => [key, toolField(key, schema, query)]),
  );
}

function withoutHubFilled(name: EndpointName, fields: Fields): Fields {
  const filled = mcpOperationTraits(name).callIdentity;
  return Object.fromEntries(Object.entries(fields).filter(([key]) => key !== filled));
}

function shapeOf(name: EndpointName): OperationShape {
  const endpoint: EndpointShape = API_ENDPOINTS[name];
  const params = fieldsOf(endpoint.params);
  const query = fieldsOf(endpoint.query);
  const flat = flatBodyOf(endpoint, [...Object.keys(params), ...Object.keys(query), BODY_FIELD]);
  const renames = renamesOf([
    ...Object.keys(params),
    ...Object.keys(query),
    ...Object.keys(flat ?? {}),
  ]);
  const computer = endpoint.path.startsWith(COMPUTER_PATH) && 'deviceId' in params;
  const fields = {
    params: {
      ...toolFields(surfaced(params, renames), false),
      ...(computer ? { deviceId: COMPUTER_ID } : {}),
    },
    query: toolFields(surfaced(query, renames), true),
    body: toolFields(surfaced(bodyFieldsOf(endpoint, flat), renames), false),
  };
  const named = Object.keys({ ...fields.params, ...fields.query, ...fields.body });
  const personal =
    PERSONAL_AREAS.has(mcpOperationArea(endpoint)) && mcpOperationTraits(name).householdWide !== true;
  return {
    name,
    endpoint,
    params: Object.keys(fields.params),
    query: Object.keys(fields.query),
    flatBody: flat === null ? null : Object.keys(fields.body),
    computer,
    acting: personal || Object.values(renames).includes(ACTING_FIELD),
    fromTool: Object.fromEntries(
      Object.entries(renames).map(([endpointKey, tool]) => [tool, endpointKey]),
    ),
    input: z.strictObject({
      ...fields.params,
      ...fields.query,
      ...withoutHubFilled(name, fields.body),
      ...(personal && !named.includes(ACTING_FIELD) ? { [ACTING_FIELD]: PERSON_FIELD } : {}),
    }),
  };
}

function picked(
  shape: OperationShape,
  args: Readonly<Record<string, unknown>>,
  names: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    names
      .filter((name) => args[name] !== undefined)
      .map((name) => [shape.fromTool[name] ?? name, args[name]]),
  );
}

function bodyOf(shape: OperationShape, args: Readonly<Record<string, unknown>>): unknown {
  if (shape.endpoint.body === NO_BODY) {
    return undefined;
  }
  return shape.flatBody === null ? args[BODY_FIELD] : picked(shape, args, shape.flatBody);
}

function unknownFields(shape: OperationShape, args: Readonly<Record<string, unknown>>): string[] {
  const known = new Set([
    ...shape.params,
    ...shape.query,
    ...(shape.flatBody ?? []),
    ACTING_FIELD,
    BODY_FIELD,
  ]);
  return Object.keys(args).filter((key) => !known.has(key));
}

export function operationInput(
  shape: OperationShape,
  args: Readonly<Record<string, unknown>>,
): OperationInput {
  const unknown = unknownFields(shape, args);
  if (unknown.length > 0) {
    throw new ToolError(
      `${shape.name} does not take ${unknown.join(', ')}; tool_read gives its fields`,
    );
  }
  return {
    params: Object.fromEntries(
      Object.entries(picked(shape, args, shape.params)).map(([name, value]) => [
        name,
        String(value),
      ]),
    ),
    query: Object.fromEntries(
      Object.entries(picked(shape, args, shape.query)).map(([name, value]) => [
        name,
        typeof value === 'boolean' ? String(value) : Array.isArray(value) ? value.join(',') : value,
      ]),
    ),
    body: bodyOf(shape, args),
  };
}

export function isEndpointName(name: string): name is EndpointName {
  return Object.hasOwn(API_ENDPOINTS, name);
}

export const CALLABLE_OPERATIONS: readonly EndpointName[] = Object.keys(API_ENDPOINTS)
  .filter(isEndpointName)
  .filter((name) => !isHumanOnlyOperation(name) && MCP_UNAVAILABLE_OPERATIONS[name] === undefined);
