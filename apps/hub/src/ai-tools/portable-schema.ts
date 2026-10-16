import { z } from 'zod';

type Json = Readonly<Record<string, unknown>>;

const DROPPED_KEYS: ReadonlySet<string> = new Set(['$defs', '$schema', 'definitions']);

export class ToolSchemaReferenceError extends Error {
  override readonly name = 'ToolSchemaReferenceError';

  constructor(
    readonly reference: string,
    readonly reason: string,
  ) {
    super(`Cannot declare tool schema reference ${reference}: ${reason}`);
  }
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodedPointer(reference: string): string {
  try {
    return decodeURIComponent(reference.slice(2));
  } catch (cause) {
    if (cause instanceof URIError) {
      throw new ToolSchemaReferenceError(reference, 'invalid URI encoding');
    }
    throw cause;
  }
}

export function referenceTarget(root: Json, reference: string): unknown {
  if (reference === '#') return root;
  if (!reference.startsWith('#/')) {
    throw new ToolSchemaReferenceError(reference, 'expected a local JSON pointer');
  }
  let target: unknown = root;
  const pointer = decodedPointer(reference);
  for (const segment of pointer.split('/')) {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(target) && /^(0|[1-9][0-9]*)$/u.test(key)) {
      const values = z.array(z.unknown()).parse(target);
      target = values.at(Number(key));
    } else if (isRecord(target) && Object.hasOwn(target, key)) {
      target = target[key];
    } else {
      throw new ToolSchemaReferenceError(reference, `missing pointer segment ${key}`);
    }
  }
  if (!isRecord(target) && typeof target !== 'boolean') {
    throw new ToolSchemaReferenceError(reference, 'target is not a JSON schema');
  }
  return target;
}

function isJsonValue(schema: unknown, reference: string): boolean {
  const recursive = z.strictObject({ $ref: z.literal(reference) });
  return z
    .strictObject({
      anyOf: z.tuple([
        z.strictObject({ type: z.literal('string') }),
        z.strictObject({ type: z.literal('number') }),
        z.strictObject({ type: z.literal('boolean') }),
        z.strictObject({ type: z.literal('null') }),
        z.strictObject({ type: z.literal('array'), items: recursive }),
        z.strictObject({
          type: z.literal('object'),
          propertyNames: z.strictObject({ type: z.literal('string') }),
          additionalProperties: recursive,
        }),
      ]),
    })
    .safeParse(schema).success;
}

function inlineReference(
  node: Json,
  root: Json,
  open: ReadonlySet<string>,
  reference: string,
): unknown {
  if (open.has(reference)) {
    throw new ToolSchemaReferenceError(reference, 'recursive schemas cannot be inlined');
  }
  const raw = referenceTarget(root, reference);
  const target = isJsonValue(raw, reference)
    ? { type: ['string', 'number', 'boolean', 'null', 'array', 'object'] }
    : inline(raw, root, new Set([...open, reference]));
  const siblings = inline(
    Object.fromEntries(Object.entries(node).filter(([key]) => key !== '$ref')),
    root,
    open,
  );
  return isRecord(siblings) && Object.keys(siblings).length > 0
    ? { allOf: [target, siblings] }
    : target;
}

function inline(node: unknown, root: Json, open: ReadonlySet<string>): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => inline(entry, root, open));
  }
  if (!isRecord(node)) {
    return node;
  }
  const reference = node['$ref'];
  if (typeof reference === 'string') {
    return inlineReference(node, root, open, reference);
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !DROPPED_KEYS.has(key))
      .map(([key, value]) => [key, inline(value, root, open)]),
  );
}

export function portableSchemaOf(schema: Json): Json {
  const inlined = inline(schema, schema, new Set());
  if (!isRecord(inlined)) {
    throw new ToolSchemaReferenceError('#', 'root is not an object schema');
  }
  return inlined;
}
