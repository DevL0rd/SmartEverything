import { z } from 'zod';
import { DSH_SESSION_ID } from '@smarteverything/domain';

const SOURCE = z.strictObject({
  kind: z.literal('smarteverything-helper-input'),
  deliveryId: z.uuid(),
});
const INPUT = z.object({ id: z.string(), source: z.unknown().optional() });

export type HelperInputSource = z.infer<typeof SOURCE>;

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'smarteverything-helper-input': HelperInputSource;
  }
}

export function helperInputSource(deliveryId: string): HelperInputSource {
  return SOURCE.parse({ kind: 'smarteverything-helper-input', deliveryId });
}

export function helperInputId(input: unknown): string | undefined {
  const message = INPUT.safeParse(input);
  if (!message.success) return undefined;
  const source = SOURCE.safeParse(message.data.source);
  return source.success ? source.data.deliveryId : undefined;
}

export function nativeInputId(input: unknown): string | undefined {
  const message = INPUT.safeParse(input);
  if (!message.success) return undefined;
  return helperInputId(message.data) ?? message.data.id;
}

export const HELPER_RELAY_RECEIPT = 'plugin:smarteverything/helper-relay-receipt';
export const HELPER_RELAY_RECEIPT_DATA = z.strictObject({
  deliveryId: z.uuid(),
  parentSessionId: DSH_SESSION_ID,
  messageId: z.uuid(),
});
