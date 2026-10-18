import type { JsonSchema, ToolSpec } from './hub-tool';
import { referenceTarget } from './portable-schema';

const ENUM_CHARS_MAX = 120;

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemasOf(value: unknown): JsonSchema[] {
  return Array.isArray(value) ? value.filter(isSchema) : [];
}

function enumText(values: readonly unknown[]): string {
  const text = values.map((value) => JSON.stringify(value)).join('|');
  return text.length <= ENUM_CHARS_MAX ? text : `one of ${String(values.length)} values`;
}

function fieldsText(schema: JsonSchema): string {
  const properties = schema['properties'];
  if (!isSchema(properties)) {
    return 'object';
  }
  const required = new Set(Array.isArray(schema['required']) ? schema['required'] : []);
  const names = Object.keys(properties).map((name) => (required.has(name) ? name : `${name}?`));
  return names.length === 0 ? 'object' : `{${names.join(', ')}}`;
}

interface Scope {
  readonly root: JsonSchema;
  readonly open: ReadonlySet<string>;
}

function referencedText(reference: string, scope: Scope): string {
  const target = referenceTarget(scope.root, reference);
  return scope.open.has(reference) || !isSchema(target)
    ? 'value'
    : typeText(target, { root: scope.root, open: new Set([...scope.open, reference]) });
}

function literalText(schema: JsonSchema): string | null {
  const values = schema['enum'];
  if (Array.isArray(values)) {
    return enumText(values);
  }
  return 'const' in schema ? JSON.stringify(schema['const']) : null;
}

function structureText(schema: JsonSchema, scope: Scope): string {
  const type = schema['type'];
  if (Array.isArray(type)) {
    return type.map(String).join('|');
  }
  if (type === 'array') {
    const items = schema['items'];
    return `${isSchema(items) ? typeText(items, scope) : 'value'}[]`;
  }
  if (type === 'object' || isSchema(schema['properties'])) {
    return fieldsText(schema);
  }
  return typeof type === 'string' ? type : 'value';
}

function typeText(schema: JsonSchema, scope: Scope): string {
  const reference = schema['$ref'];
  if (typeof reference === 'string') {
    return referencedText(reference, scope);
  }
  const literal = literalText(schema);
  if (literal !== null) {
    return literal;
  }
  const options = [...schemasOf(schema['anyOf']), ...schemasOf(schema['oneOf'])];
  return options.length > 0
    ? [...new Set(options.map((option) => typeText(option, scope)))].join('|')
    : structureText(schema, scope);
}

function signatureOf(schema: JsonSchema): string {
  const scope: Scope = { root: schema, open: new Set() };
  const properties = schema['properties'];
  if (!isSchema(properties)) {
    return '';
  }
  const required = new Set(Array.isArray(schema['required']) ? schema['required'] : []);
  return Object.entries(properties)
    .map(([name, value]) => {
      const optional = required.has(name) ? '' : '?';
      return `${name}${optional}: ${isSchema(value) ? typeText(value, scope) : 'value'}`;
    })
    .join(', ');
}

export function catalogueLine(tool: ToolSpec): string {
  const description = tool.description.replace(/\s+/g, ' ').trim();
  return `${tool.name}(${signatureOf(tool.inputSchema)}): ${description}`;
}

export function catalogueText(tools: readonly ToolSpec[]): string {
  return [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(catalogueLine)
    .join('\n');
}
