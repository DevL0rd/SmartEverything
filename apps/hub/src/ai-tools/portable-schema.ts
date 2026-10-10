type Json = Readonly<Record<string, unknown>>;

const DROPPED_KEYS: ReadonlySet<string> = new Set(['$defs', '$schema', 'definitions']);

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function definitionsOf(schema: Json): Json {
  const definitions = schema['$defs'];
  return isRecord(definitions) ? definitions : {};
}

function referenceName(reference: string): string {
  return reference.slice(reference.lastIndexOf('/') + 1);
}

function inline(node: unknown, definitions: Json, open: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => inline(entry, definitions, open));
  }
  if (!isRecord(node)) {
    return node;
  }
  const reference = node['$ref'];
  if (typeof reference === 'string') {
    const name = referenceName(reference);
    const rest = Object.fromEntries(Object.entries(node).filter(([key]) => key !== '$ref'));
    if (open.has(name)) {
      return rest;
    }
    const target = inline(definitions[name], definitions, new Set([...open, name]));
    return isRecord(target) ? { ...rest, ...target } : rest;
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !DROPPED_KEYS.has(key))
      .map(([key, value]) => [key, inline(value, definitions, open)]),
  );
}

export function portableSchemaOf(schema: Json): Json {
  const inlined = inline(schema, definitionsOf(schema), new Set());
  return isRecord(inlined) ? inlined : {};
}
