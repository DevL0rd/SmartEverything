export function stringArgument(args: Readonly<Record<string, unknown>>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function recordArgument(
  args: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  const value = args[key];
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function allowsNull(schema: unknown): boolean {
  return JSON.stringify(schema).includes('"type":"null"');
}

export function withoutAbsentFields(
  inputSchema: Readonly<Record<string, unknown>>,
  args: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const properties = recordArgument(inputSchema, 'properties');
  return Object.fromEntries(
    Object.entries(args).filter(([key, value]) => value !== null || allowsNull(properties[key])),
  );
}
