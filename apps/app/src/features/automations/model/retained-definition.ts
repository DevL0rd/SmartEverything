import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';

function jsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}
function omittedKeys(original: JsonValue, parsed: JsonValue, path: string): readonly string[] {
  if (jsonArray(original)) {
    if (!jsonArray(parsed)) return [path];
    return original.flatMap((value, index) => {
      const next = parsed[index];
      return next === undefined
        ? [`${path}.${String(index)}`]
        : omittedKeys(value, next, `${path}.${String(index)}`);
    });
  }
  if (original === null || typeof original !== 'object') return [];
  if (parsed === null || typeof parsed !== 'object' || jsonArray(parsed)) return [path];
  return Object.entries(original).flatMap(([key, value]) => {
    const next = parsed[key];
    return next === undefined ? [`${path}.${key}`] : omittedKeys(value, next, `${path}.${key}`);
  });
}
export function omittedDefinitionFields(original: unknown, parsed: unknown): readonly string[] {
  const before = JSON_VALUE.safeParse(original);
  const after = JSON_VALUE.safeParse(parsed);
  return before.success && after.success
    ? omittedKeys(before.data, after.data, 'definition')
    : ['definition'];
}
