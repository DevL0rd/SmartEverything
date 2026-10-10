const PLACEHOLDER = /\$\{(home|data|secret:([a-z][a-z0-9_.-]{0,79}))\}/g;

export interface PlaceholderValues {
  readonly home: string;
  readonly data: string;
  readonly secret: (name: string) => string | null;
}

export class MissingSecretError extends Error {
  override readonly name = 'MissingSecretError';

  constructor(
    readonly secret: string,
    label?: string,
  ) {
    super(
      label === undefined
        ? `The plugin needs its ${secret} secret; add it in the plugin's settings.`
        : `Add the “${label}” in the plugin's settings.`,
    );
  }
}

export function filledIn(text: string, values: PlaceholderValues): string {
  return text.replace(PLACEHOLDER, (_match: string, kind: string, secret: string | undefined) => {
    if (secret === undefined) {
      return kind === 'home' ? values.home : values.data;
    }
    const value = values.secret(secret);
    if (value === null) {
      throw new MissingSecretError(secret);
    }
    return value;
  });
}

export function filledRecord(
  record: Readonly<Record<string, string>>,
  values: PlaceholderValues,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, text]) => [key, filledIn(text, values)]),
  );
}
