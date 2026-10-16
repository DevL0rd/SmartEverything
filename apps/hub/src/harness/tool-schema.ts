import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';
import {
  assertObjectJsonSchema,
  assertSupportedJsonSchema,
  JsonSchemaError,
} from '@deepseek-ai/dsh-tools';
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import { portableSchemaOf, ToolSchemaReferenceError } from '../ai-tools/portable-schema';
import { validateSchemaReferences } from '../ai-tools/referenced-schema';
import type { JsonSchema } from '../ai-tools/hub-tool';

const RECORD = z.record(z.string(), JSON_VALUE);
const STRUCTURE = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'oneOf',
]);
const ANNOTATIONS = new Set(['description', 'title', 'default', 'examples']);
export function harnessToolSchema(input: JsonSchema): ObjectJsonSchema {
  const schema = project(declarationInput(input));
  assertObjectJsonSchema(schema);
  return schema;
}
function project(input: unknown): Record<string, unknown> {
  const node = RECORD.parse(input);
  const shape: Record<string, unknown> = {};
  const constraints: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'anyOf') {
      const union = projectUnion(value);
      if (union === null) constraints[key] = value;
      else Object.assign(shape, union);
      continue;
    }
    if (ANNOTATIONS.has(key)) {
      shape[key] = value;
      continue;
    }
    if (!STRUCTURE.has(key)) {
      constraints[key] = value;
      continue;
    }
    const transformed = structural(key, value);
    if (transformed.shape !== undefined) shape[key] = transformed.shape;
    if (transformed.constraint !== undefined) constraints[key] = transformed.constraint;
  }
  if (Object.keys(constraints).length > 0)
    shape['description'] = [
      typeof node['description'] === 'string' ? node['description'] : '',
      `Hub validates: ${JSON.stringify(constraints)}`,
    ]
      .filter((text) => text !== '')
      .join('\n');
  return shape;
}
function structural(
  key: string,
  value: z.infer<typeof JSON_VALUE>,
): { readonly shape: unknown; readonly constraint?: unknown } {
  if (key === 'properties')
    return {
      shape: Object.fromEntries(
        Object.entries(RECORD.parse(value)).map(([name, property]) => [name, project(property)]),
      ),
    };
  if (key === 'items') return { shape: project(value) };
  if (key === 'oneOf') return { shape: z.array(JSON_VALUE).parse(value).map(project) };
  if (key === 'additionalProperties' && typeof value !== 'boolean')
    return { shape: true, constraint: value };
  if (key === 'type' && Array.isArray(value)) return { shape: undefined, constraint: value };
  return { shape: value };
}
function projectUnion(value: unknown): Record<string, unknown> | null {
  const branches = z.array(RECORD).min(2).parse(value);
  const types = branches.map((branch) => branch['type']);
  if (distinctTypes(types)) {
    return projectedUnion(branches);
  }
  const first = branches[0];
  const required = z.array(z.string()).safeParse(first?.['required']);
  if (required.success && required.data.some((key) => distinctTags(branches, key)))
    return projectedUnion(branches);
  return null;
}
function projectedUnion(
  branches: readonly z.infer<typeof RECORD>[],
): Record<string, unknown> | null {
  const union = { oneOf: branches.map(project) };
  try {
    assertSupportedJsonSchema(union);
    return union;
  } catch (cause) {
    if (cause instanceof JsonSchemaError) return null;
    throw cause;
  }
}
function distinctTypes(types: readonly unknown[]): boolean {
  return (
    types.every((type) => typeof type === 'string') &&
    new Set(types).size === types.length &&
    !(types.includes('number') && types.includes('integer'))
  );
}
function distinctTags(branches: readonly z.infer<typeof RECORD>[], key: string): boolean {
  const tags = branches.map((branch) => tag(branch, key));
  return tags.every((tag) => tag !== null) && new Set(tags).size === tags.length;
}
function tag(branch: z.infer<typeof RECORD>, key: string): string | null {
  if (branch['type'] !== 'object') return null;
  const properties = RECORD.safeParse(branch['properties']);
  if (!properties.success) return null;
  const property = RECORD.safeParse(properties.data[key]);
  if (!property.success || property.data['const'] === undefined) return null;
  const required = z.array(z.string()).safeParse(branch['required']);
  if (!required.success || !required.data.includes(key)) return null;
  return JSON.stringify(property.data['const']);
}

function declarationInput(input: JsonSchema): JsonSchema {
  try {
    return portableSchemaOf(input);
  } catch (cause) {
    if (
      !(cause instanceof ToolSchemaReferenceError) ||
      cause.reason !== 'recursive schemas cannot be inlined'
    )
      throw cause;
  }
  validateSchemaReferences(input);
  return input;
}
