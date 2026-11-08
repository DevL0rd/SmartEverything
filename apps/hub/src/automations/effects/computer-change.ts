export type Pair = readonly [key: string, port: string];

export type Fields = Readonly<Record<string, readonly Pair[]>>;

export const same = (...names: readonly string[]): readonly Pair[] =>
  names.map((name): Pair => [name, name]);

export function mergedChange(
  fields: Fields,
  params: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const action = params['action'];
  const typed = (typeof action === 'string' ? (fields[action] ?? []) : []).flatMap(
    ([key, port]): readonly [string, unknown][] => {
      const value = params[port];
      return value === undefined ? [] : [[key, value]];
    },
  );
  return { ...Object.fromEntries(typed), action };
}
