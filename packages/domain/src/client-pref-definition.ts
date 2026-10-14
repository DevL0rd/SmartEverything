import { z } from 'zod';
import { JSON_VALUE, type JsonValue } from './values';

export type ClientPrefRead<T> =
  | { readonly status: 'absent'; readonly value: T }
  | { readonly status: 'stored'; readonly value: T; readonly migrated: boolean }
  | { readonly status: 'invalid'; readonly reason: string };

export const LAYOUT_SCOPES = ['profile', 'client'] as const;

export type LayoutScope = (typeof LAYOUT_SCOPES)[number];

export interface ClientPrefDefinition<T> {
  readonly storageKey: string;
  readonly scope: LayoutScope;
  readonly version: number;
  readonly defaultValue: T;
  readonly schema: z.ZodType<T>;
  readonly decode: (stored: unknown) => ClientPrefRead<T>;
  readonly encode: (value: T) => Readonly<Record<string, JsonValue>>;
}

interface ClientPrefSpec<T> {
  readonly storageKey: string;
  readonly scope: LayoutScope;
  readonly version: number;
  readonly defaultValue: NoInfer<T>;
  readonly schema: z.ZodType<T>;
  readonly legacy: (stored: unknown) => NoInfer<T> | null;
}

const STORED_OBJECT = z.record(z.string(), JSON_VALUE);

function decoderOf<T>(spec: ClientPrefSpec<T>): (stored: unknown) => ClientPrefRead<T> {
  const envelope = z.strictObject({ version: z.literal(spec.version), value: spec.schema });
  return (stored) => {
    if (stored === null || stored === undefined) {
      return { status: 'absent', value: spec.defaultValue };
    }
    const current = envelope.safeParse(stored);
    if (current.success) {
      return { status: 'stored', value: current.data.value, migrated: false };
    }
    const legacy = spec.legacy(stored);
    if (legacy !== null) {
      return { status: 'stored', value: legacy, migrated: true };
    }
    return {
      status: 'invalid',
      reason: `The saved ${spec.storageKey} preference is not version ${String(spec.version)}: ${current.error.message}`,
    };
  };
}

export function clientPref<T>(spec: ClientPrefSpec<T>): ClientPrefDefinition<T> {
  return {
    storageKey: spec.storageKey,
    scope: spec.scope,
    version: spec.version,
    defaultValue: spec.defaultValue,
    schema: spec.schema,
    decode: decoderOf(spec),
    encode: (value) =>
      STORED_OBJECT.parse({
        version: spec.version,
        value: JSON_VALUE.parse(spec.schema.parse(value)),
      }),
  };
}

export function noLegacy(): null {
  return null;
}
