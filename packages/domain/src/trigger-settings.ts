import { z } from 'zod';
import { SIGNAL_SOURCE_NAME } from './signals';
import type { SignalKindSpec } from './signal-sources/spec';

export const TRIGGER_KIND_KEY = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}\/[^/\s]{1,80}$/, 'source/kind');

export const TRIGGER_SETTINGS = z.strictObject({
  sources: z.record(SIGNAL_SOURCE_NAME, z.boolean()),
  kinds: z.record(TRIGGER_KIND_KEY, z.boolean()),
});

export type TriggerSettings = z.infer<typeof TRIGGER_SETTINGS>;

export const DEFAULT_TRIGGER_SETTINGS: TriggerSettings = { sources: {}, kinds: {} };

export const TRIGGER_SETTINGS_CHANGE = z
  .strictObject({
    sources: z
      .record(SIGNAL_SOURCE_NAME, z.boolean().nullable())
      .describe('Source name to on or off; null puts the source back to its default (on)'),
    kinds: z
      .record(TRIGGER_KIND_KEY, z.boolean().nullable())
      .describe(
        'source/kind to on or off; null puts the kind back to its default (on, off for kinds that need opting in such as phone notification text)',
      ),
  })
  .partial()
  .refine((change) => change.sources !== undefined || change.kinds !== undefined, {
    message: 'name sources or kinds to change',
  });

export type TriggerSettingsChange = z.infer<typeof TRIGGER_SETTINGS_CHANGE>;

export function triggerKindKey(source: string, kind: string): string {
  return `${source}/${kind}`;
}

export function triggerSourceEnabled(settings: TriggerSettings, source: string): boolean {
  return settings.sources[source] ?? true;
}

export function triggerKindEnabled(
  settings: TriggerSettings,
  source: string,
  spec: Pick<SignalKindSpec, 'kind' | 'optIn'>,
): boolean {
  return (
    triggerSourceEnabled(settings, source) &&
    (settings.kinds[triggerKindKey(source, spec.kind)] ?? spec.optIn !== true)
  );
}

function overridden(
  current: Readonly<Record<string, boolean>>,
  change: Readonly<Record<string, boolean | null>> | undefined,
): Record<string, boolean> {
  const next = new Map(Object.entries(current));
  for (const [key, value] of Object.entries(change ?? {})) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  return Object.fromEntries(next);
}

export function applyTriggerSettingsChange(
  settings: TriggerSettings,
  change: TriggerSettingsChange,
): TriggerSettings {
  return {
    sources: overridden(settings.sources, change.sources),
    kinds: overridden(settings.kinds, change.kinds),
  };
}
