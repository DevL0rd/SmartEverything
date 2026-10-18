type Json = Readonly<Record<string, unknown>>;

const VALIDATION_ONLY: ReadonlySet<string> = new Set([
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'exclusiveMinimum',
  'exclusiveMaximum',
]);

const SCHEMA_MAPS: ReadonlySet<string> = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
]);

const SCHEMA_LISTS: ReadonlySet<string> = new Set(['anyOf', 'oneOf', 'allOf', 'prefixItems']);

const SCHEMA_VALUES: ReadonlySet<string> = new Set([
  'items',
  'additionalProperties',
  'propertyNames',
  'not',
]);

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaEntry(key: string, value: unknown): unknown {
  if (SCHEMA_MAPS.has(key) && isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([name, node]) => [name, strip(node)]));
  }
  if (SCHEMA_LISTS.has(key) && Array.isArray(value)) {
    return value.map(strip);
  }
  return SCHEMA_VALUES.has(key) ? strip(value) : value;
}

function strip(node: unknown): unknown {
  if (!isRecord(node)) {
    return node;
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(
        ([key, value]) =>
          !VALIDATION_ONLY.has(key) &&
          !(key === 'additionalProperties' && typeof value === 'boolean'),
      )
      .map(([key, value]) => [key, schemaEntry(key, value)]),
  );
}

export function geminiSchemaOf(schema: Json): Json {
  const result = strip(schema);
  return isRecord(result) ? result : schema;
}
