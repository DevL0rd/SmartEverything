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
