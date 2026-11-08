export type FieldMap = Readonly<Record<string, unknown>>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

export function valuesEqual(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

export function fieldNames(...maps: readonly FieldMap[]): readonly string[] {
  const names = new Set<string>();
  for (const map of maps) {
    for (const [name, value] of Object.entries(map)) {
      if (value !== undefined) names.add(name);
    }
  }
  return [...names].sort();
}

export function present(map: FieldMap, name: string): unknown {
  return Object.hasOwn(map, name) ? map[name] : undefined;
}
