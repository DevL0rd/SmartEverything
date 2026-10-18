import {
  API_ENDPOINTS,
  MCP_UNAVAILABLE_OPERATIONS,
  NO_BODY,
  isHumanOnlyOperation,
  mcpOperationArea,
  type EndpointName,
  type EndpointShape,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { OperationInput } from '../../../server/operations';
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

function renamesOf(keys: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const tool = TOOL_FIELDS[key];
      return tool === undefined || keys.includes(tool) ? [] : [[key, tool]];
    }),
  );
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
  const fields = {
    params: surfaced(params, renames),
    query: surfaced(query, renames),
    body: surfaced(bodyFieldsOf(endpoint, flat), renames),
  };
  const named = Object.keys({ ...fields.params, ...fields.query, ...fields.body });
  const personal = PERSONAL_AREAS.has(mcpOperationArea(endpoint));
  return {
    name,
    endpoint,
    params: Object.keys(fields.params),
    query: Object.keys(fields.query),
    flatBody: flat === null ? null : Object.keys(fields.body),
    acting: personal || Object.values(renames).includes(ACTING_FIELD),
    fromTool: Object.fromEntries(
      Object.entries(renames).map(([endpointKey, tool]) => [tool, endpointKey]),
    ),
    input: z.strictObject({
      ...fields.params,
      ...fields.query,
      ...fields.body,
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
      `${shape.name} does not take ${unknown.join(', ')}; list_operations gives its fields`,
    );
  }
  return {
    params: Object.fromEntries(
      Object.entries(picked(shape, args, shape.params)).map(([name, value]) => [
        name,
        String(value),
      ]),
    ),
    query: picked(shape, args, shape.query),
    body: bodyOf(shape, args),
  };
}

export function isEndpointName(name: string): name is EndpointName {
  return Object.hasOwn(API_ENDPOINTS, name);
}

export const CALLABLE_OPERATIONS: readonly EndpointName[] = Object.keys(API_ENDPOINTS)
  .filter(isEndpointName)
  .filter((name) => !isHumanOnlyOperation(name) && MCP_UNAVAILABLE_OPERATIONS[name] === undefined);
