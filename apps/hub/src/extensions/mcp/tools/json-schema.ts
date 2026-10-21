import { z } from 'zod';
import { FIELD_TEXTS, ID_SOURCES } from './field-texts';
import { sharedReference, sharedSchemaNamedEntry, sharedSchemaOf } from './shared-schemas';

const SHARED_MARK = 'x-shared-schema';

function advertised(context: {
  readonly zodSchema: z.core.$ZodType;
  readonly jsonSchema: Record<string, unknown>;
}): void {
  const { jsonSchema } = context;
  const shared = sharedSchemaOf(context.zodSchema);
  if (shared !== undefined) {
    jsonSchema[SHARED_MARK] = shared.name;
    return;
  }
  if (typeof jsonSchema['format'] === 'string') {
    delete jsonSchema['pattern'];
  }
}

function withSharedReferences(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withSharedReferences);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const name: unknown = Object.getOwnPropertyDescriptor(value, SHARED_MARK)?.value;
  const shared = typeof name === 'string' ? sharedSchemaNamedEntry(name) : undefined;
  if (shared !== undefined) {
    return sharedReference(shared);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, withSharedReferences(child)]),
  );
}

const DEFINITIONS = z.record(z.string(), z.unknown());

const SCHEMA_OBJECT = z.record(z.string(), z.unknown());

const PROPERTY = z.looseObject({ description: z.string().optional() });

function generalText(key: string): string | undefined {
  const source = ID_SOURCES[key];
  return source === undefined ? FIELD_TEXTS[key] : `The id from ${source}`;
}

function describedId(key: string, schema: unknown): unknown {
  const property = PROPERTY.safeParse(schema);
  const text = generalText(key);
  if (!property.success || property.data.description !== undefined || text === undefined) {
    return withIdSources(schema);
  }
  return { ...withObject(withIdSources(schema)), description: text };
}

function withObject(value: unknown): Readonly<Record<string, unknown>> {
  return PROPERTY.parse(value);
}

function withIdSources(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withIdSources);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]: [string, unknown]) => {
      const properties = key === 'properties' ? SCHEMA_OBJECT.safeParse(child) : null;
      return properties?.success === true
        ? [
            key,
            Object.fromEntries(
              Object.entries(properties.data).map(([name, schema]) => [
                name,
                describedId(name, schema),
              ]),
            ),
          ]
        : [key, withIdSources(child)];
    }),
  );
}

function schemaOf(
  schema: z.core.$ZodType,
  io: 'input' | 'output',
  reused: 'ref' | 'inline',
): Record<string, unknown> {
  const json: Record<string, unknown> = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
    reused,
    cycles: 'ref',
    override: advertised,
  });
  delete json['$schema'];
  return withoutUnusedDefinitions(DEFINITIONS.parse(withIdSources(withSharedReferences(json))));
}

const REFERENCE = /"#\/\$defs\/([^"]+)"/gu;

function referencesIn(value: unknown): readonly string[] {
  return [...JSON.stringify(value).matchAll(REFERENCE)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function withoutUnusedDefinitions(json: Record<string, unknown>): Record<string, unknown> {
  const definitions = DEFINITIONS.safeParse(json['$defs']);
  if (!definitions.success) {
    return json;
  }
  const { $defs: _defs, ...root } = json;
  const used = new Set<string>();
  const pending = [...referencesIn(root)];
  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (!used.has(name)) {
      used.add(name);
      pending.push(...referencesIn(definitions.data[name]));
    }
  }
  const kept = Object.entries(definitions.data).filter(([name]) => used.has(name));
  return kept.length === 0 ? root : { ...root, $defs: Object.fromEntries(kept) };
}

export function inlineSchemaOf(
  schema: z.core.$ZodType,
  io: 'input' | 'output',
): Record<string, unknown> {
  return schemaOf(schema, io, 'inline');
}

export function jsonSchemaOf(
  schema: z.core.$ZodType,
  io: 'input' | 'output',
): Record<string, unknown> {
  const shared = schemaOf(schema, io, 'ref');
  const inline = schemaOf(schema, io, 'inline');
  return JSON.stringify(shared).length < JSON.stringify(inline).length ? shared : inline;
}
