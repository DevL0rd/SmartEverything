export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

export function stringField(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

export function numberField(source: JsonObject, key: string): number | undefined {
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

export function objectField(source: JsonObject, key: string): JsonObject | undefined {
  const value = source[key];
  return isObject(value) ? value : undefined;
}

export function listField(source: JsonObject, key: string): readonly unknown[] | undefined {
  const value = source[key];
  return isList(value) ? value : undefined;
}

export function mergePatch(target: JsonObject, patch: JsonObject): JsonObject {
  const merged = new Map<string, unknown>(Object.entries(target));
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      merged.delete(key);
      continue;
    }
    const current = merged.get(key);
    merged.set(key, isObject(value) && isObject(current) ? mergePatch(current, value) : value);
  }
  return Object.fromEntries(merged);
}

export function pickFields(source: JsonObject, keys: readonly string[]): JsonObject {
  const picked: JsonObject = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}

export function omitFields(source: JsonObject, keys: readonly string[]): JsonObject {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));
}
