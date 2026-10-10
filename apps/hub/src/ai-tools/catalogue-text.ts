import type { JsonSchema, ToolSpec } from './hub-tool';

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

function typeText(schema: JsonSchema): string {
  const values = schema['enum'];
  if (Array.isArray(values)) {
    return enumText(values);
  }
  if ('const' in schema) {
    return JSON.stringify(schema['const']);
  }
  const options = [...schemasOf(schema['anyOf']), ...schemasOf(schema['oneOf'])];
  if (options.length > 0) {
    return [...new Set(options.map(typeText))].join('|');
  }
  const type = schema['type'];
  if (Array.isArray(type)) {
    return type.map(String).join('|');
  }
  if (type === 'array') {
    const items = schema['items'];
    return `${isSchema(items) ? typeText(items) : 'value'}[]`;
  }
  if (type === 'object' || isSchema(schema['properties'])) {
    return fieldsText(schema);
  }
  return typeof type === 'string' ? type : 'value';
}

export function signatureOf(schema: JsonSchema): string {
  const properties = schema['properties'];
  if (!isSchema(properties)) {
    return '';
  }
  const required = new Set(Array.isArray(schema['required']) ? schema['required'] : []);
  return Object.entries(properties)
    .map(([name, value]) => {
      const optional = required.has(name) ? '' : '?';
      return `${name}${optional}: ${isSchema(value) ? typeText(value) : 'value'}`;
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
