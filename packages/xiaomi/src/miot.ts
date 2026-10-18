import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { MiioPacketError, MiotRefusedError } from './errors';

export interface PropertyAddress {
  readonly siid: number;
  readonly piid: number;
}

export interface ActionAddress {
  readonly siid: number;
  readonly aiid: number;
}

export interface PropertyWrite extends PropertyAddress {
  readonly value: JsonValue;
}

export type PropertyReading =
  | (PropertyAddress & { readonly ok: true; readonly value: JsonValue })
  | (PropertyAddress & { readonly ok: false; readonly code: number });

const ACCEPTED_CODES: ReadonlySet<number> = new Set([0, 1]);

const PROPERTY_RESULT = z.object({
  siid: z.number().int(),
  piid: z.number().int(),
  code: z.number().int(),
  value: JSON_VALUE.optional(),
});

const ACTION_RESULT = z.object({
  code: z.number().int(),
  out: z.array(JSON_VALUE).optional(),
});

export function getPropertiesParams(
  did: string,
  properties: readonly PropertyAddress[],
): JsonValue {
  return properties.map(({ siid, piid }) => ({ did, siid, piid }));
}

export function setPropertiesParams(did: string, writes: readonly PropertyWrite[]): JsonValue {
  return writes.map(({ siid, piid, value }) => ({ did, siid, piid, value }));
}

export function actionParams(
  did: string,
  action: ActionAddress,
  inputs: readonly JsonValue[],
): JsonValue {
  return { did, siid: action.siid, aiid: action.aiid, in: inputs };
}

function parseList(result: unknown, subject: string): z.infer<typeof PROPERTY_RESULT>[] {
  const parsed = z.array(PROPERTY_RESULT).safeParse(result);
  if (!parsed.success) {
    throw new MiioPacketError(`a list of ${subject} results`, 'a reply of another shape');
  }
  return parsed.data;
}

export function parsePropertyReadings(result: unknown): PropertyReading[] {
  return parseList(result, 'property').map(({ siid, piid, code, value }) =>
    code === 0 && value !== undefined
      ? { siid, piid, ok: true, value }
      : { siid, piid, ok: false, code },
  );
}

export function checkPropertyWrites(result: unknown): void {
  const refused = parseList(result, 'property write').find(({ code }) => !ACCEPTED_CODES.has(code));
  if (refused !== undefined) {
    throw new MiotRefusedError('property', refused.siid, refused.piid, refused.code);
  }
}

export function parseActionResult(action: ActionAddress, result: unknown): JsonValue {
  const parsed = ACTION_RESULT.safeParse(result);
  if (!parsed.success) {
    throw new MiioPacketError('an action result', 'a reply of another shape');
  }
  if (!ACCEPTED_CODES.has(parsed.data.code)) {
    throw new MiotRefusedError('action', action.siid, action.aiid, parsed.data.code);
  }
  return parsed.data.out ?? [];
}
