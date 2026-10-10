import { useMemo } from 'react';
import type { PluginId } from '@smarteverything/domain';
import { z } from 'zod';
import { usePluginData } from '../use-plugin-data';

export type PluginStream<T> =
  | { readonly state: 'waiting' }
  | { readonly state: 'invalid'; readonly reason: string }
  | { readonly state: 'ready'; readonly value: T; readonly at: string };

export function usePluginStream<T>(
  pluginId: PluginId,
  stream: string,
  schema: z.ZodType<T>,
): PluginStream<T> {
  const data = usePluginData(pluginId, stream);
  return useMemo((): PluginStream<T> => {
    if (data === null) {
      return { state: 'waiting' };
    }
    const parsed = schema.safeParse(data.value);
    return parsed.success
      ? { state: 'ready', value: parsed.data, at: data.at }
      : { state: 'invalid', reason: z.prettifyError(parsed.error) };
  }, [data, schema]);
}
