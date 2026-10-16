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
import {
  referencedSchemaOf,
  schemaDefinitions,
  withoutDefinitions,
} from '../../../ai-tools/referenced-schema';
import { ToolError, jsonSchemaOf } from './registry';

const OBJECT_SCHEMA = z.looseObject({
  type: z.literal('object'),
  properties: z.record(z.string(), z.unknown()).default({}),
  required: z.array(z.string()).default([]),
  $defs: z.record(z.string(), z.unknown()).optional(),
});

type ObjectSchema = z.infer<typeof OBJECT_SCHEMA>;

const PERSONAL_AREAS: ReadonlySet<string> = new Set(['health', 'nutrition', 'people', 'settings']);

export interface OperationShape {
  readonly name: EndpointName;
  readonly endpoint: EndpointShape;
  readonly params: readonly string[];
  readonly query: readonly string[];
  readonly flatBody: readonly string[] | null;
  readonly personal: boolean;
  readonly input: Record<string, unknown>;
}

function objectOf(schema: z.ZodType, namespace: string): ObjectSchema | null {
  const parsed = OBJECT_SCHEMA.safeParse(
    referencedSchemaOf(jsonSchemaOf(schema, 'input'), namespace),
  );
  return parsed.success ? parsed.data : null;
}

function flatBodyOf(
  endpoint: EndpointShape,
  taken: readonly string[],
  namespace: string,
): ObjectSchema | null {
  if (endpoint.body === NO_BODY) {
    return null;
  }
  const body = objectOf(endpoint.body, namespace);
  if (body === null || Object.keys(body.properties).some((key) => taken.includes(key))) {
    return null;
  }
  return body;
}

const EXTRA_FIELDS: readonly string[] = ['profileId', 'body'];

const PROFILE_FIELD = {
  type: 'string',
  format: 'uuid',
  description: 'Whose data; the owner’s profile when left out',
};

interface Parts {
  readonly params: ObjectSchema | null;
  readonly query: ObjectSchema | null;
  readonly flat: ObjectSchema | null;
}

interface Extra {
  readonly personal: boolean;
}

function nestedBody(endpoint: EndpointShape, parts: Parts, namespace: string): ObjectSchema | null {
  if (endpoint.body === NO_BODY || parts.flat !== null) {
    return null;
  }
  const body = referencedSchemaOf(jsonSchemaOf(endpoint.body, 'input'), namespace);
  return {
    type: 'object',
    $defs: schemaDefinitions(body),
    properties: { body: withoutDefinitions(body) },
    required: ['body'],
  };
}

function extraOf(extra: Extra): ObjectSchema {
  return {
    type: 'object',
    properties: extra.personal ? { profileId: PROFILE_FIELD } : {},
    required: [],
  };
}

function inputOf(
  endpoint: EndpointShape,
  parts: Parts,
  extra: Extra,
  namespace: string,
): Record<string, unknown> {
  const groups = [
    parts.params,
    parts.query,
    parts.flat,
    nestedBody(endpoint, parts, namespace),
    extraOf(extra),
  ].filter((group) => group !== null);
  return {
    type: 'object',
    properties: Object.assign({}, ...groups.map((group) => group.properties)),
    ...definitionsOf(groups),
    required: groups.flatMap((group) => group.required),
    additionalProperties: false,
  };
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

function shapeOf(name: EndpointName): OperationShape {
  const endpoint: EndpointShape = API_ENDPOINTS[name];
  const params = objectOf(endpoint.params, `${name}_params`);
  const query = objectOf(endpoint.query, `${name}_query`);
  const taken = [
    ...Object.keys(params?.properties ?? {}),
    ...Object.keys(query?.properties ?? {}),
    ...EXTRA_FIELDS,
  ];
  const flat = flatBodyOf(endpoint, taken, `${name}_body`);
  const personal = PERSONAL_AREAS.has(mcpOperationArea(endpoint));
  return {
    name,
    endpoint,
    params: Object.keys(params?.properties ?? {}),
    query: Object.keys(query?.properties ?? {}),
    flatBody: flat === null ? null : Object.keys(flat.properties),
    personal,
    input: inputOf(endpoint, { params, query, flat }, { personal }, `${name}_body`),
  };
}

function picked(
  args: Readonly<Record<string, unknown>>,
  names: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    names.filter((name) => args[name] !== undefined).map((name) => [name, args[name]]),
  );
}

function bodyOf(shape: OperationShape, args: Readonly<Record<string, unknown>>): unknown {
  if (shape.endpoint.body === NO_BODY) {
    return undefined;
  }
  return shape.flatBody === null ? args['body'] : picked(args, shape.flatBody);
}

function unknownFields(shape: OperationShape, args: Readonly<Record<string, unknown>>): string[] {
  const known = new Set([
    ...shape.params,
    ...shape.query,
    ...(shape.flatBody ?? []),
    ...EXTRA_FIELDS,
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
      Object.entries(picked(args, shape.params)).map(([name, value]) => [name, String(value)]),
    ),
    query: picked(args, shape.query),
    body: bodyOf(shape, args),
  };
}

export function isEndpointName(name: string): name is EndpointName {
  return Object.hasOwn(API_ENDPOINTS, name);
}

export const CALLABLE_OPERATIONS: readonly EndpointName[] = Object.keys(API_ENDPOINTS)
  .filter(isEndpointName)
  .filter((name) => !isHumanOnlyOperation(name) && MCP_UNAVAILABLE_OPERATIONS[name] === undefined);

function definitionsOf(groups: readonly ObjectSchema[]): {
  readonly $defs?: Readonly<Record<string, unknown>>;
} {
  const definitions = Object.fromEntries(
    groups.flatMap((group) => Object.entries(schemaDefinitions(group))),
  );
  return Object.keys(definitions).length === 0 ? {} : { $defs: definitions };
}
