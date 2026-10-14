import { z } from 'zod';
import { JSON_VALUE } from '@smarteverything/domain';
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import { portableSchemaOf } from '../ai-tools/portable-schema';
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
  const schema = project(portableSchemaOf(input));
  assertObjectJsonSchema(schema);
  return schema;
}
function project(input: unknown): Record<string, unknown> {
  const node = RECORD.parse(input);
  const shape: Record<string, unknown> = {};
  const constraints: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
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
  if (node['anyOf'] !== undefined) Object.assign(shape, projectUnion(node['anyOf']));
  if (Object.keys(constraints).length > 0)
    shape['description'] = [
      typeof node['description'] === 'string' ? node['description'] : '',
      `The hub validates these additional original JSON Schema constraints before execution: ${JSON.stringify(constraints)}`,
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
function projectUnion(value: unknown): Record<string, unknown> {
  const branches = z.array(RECORD).min(2).parse(value);
  const types = branches.map((branch) => branch['type']);
  if (types.every((type) => typeof type === 'string') && new Set(types).size === types.length) {
    return { oneOf: branches.map(project) };
  }
  const tags = branches.map((branch) => tag(branch));
  if (tags.every((tag) => tag !== null) && new Set(tags).size === tags.length)
    return { oneOf: branches.map(project) };
  return {};
}
function tag(branch: z.infer<typeof RECORD>): string | null {
  if (branch['type'] !== 'object') return null;
  const properties = RECORD.safeParse(branch['properties']);
  if (!properties.success) return null;
  const type = RECORD.safeParse(properties.data['type']);
  if (!type.success || typeof type.data['const'] !== 'string') return null;
  const required = z.array(z.string()).safeParse(branch['required']);
  if (!required.success || !required.data.includes('type')) return null;
  return type.data['const'];
}
