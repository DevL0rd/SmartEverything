export function failureOf(cause: unknown): Readonly<Record<string, string | number>> {
  if (!(cause instanceof Error)) {
    return { error: typeof cause };
  }
  const code: unknown = Reflect.get(cause, 'code');
  return {
    error: cause.name,
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
  };
}
