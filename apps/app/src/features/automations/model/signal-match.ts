import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';

export type Match = Readonly<Record<string, JsonValue>>;

export function changedMatch(
  match: Match | undefined,
  key: string,
  value: JsonValue | undefined,
): Match | undefined {
  const kept = Object.fromEntries(Object.entries(match ?? {}).filter(([name]) => name !== key));
  const next = value === undefined ? kept : { ...kept, [key]: value };
  return Object.keys(next).length === 0 ? undefined : next;
}

export function matchValue(text: string): JsonValue {
  try {
    const parsed = JSON_VALUE.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : text;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return text;
    }
    throw error;
  }
}
