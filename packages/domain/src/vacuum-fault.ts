import { z } from 'zod';
import type { JsonValue } from './values';

export const VACUUM_FAULT_TEXT_MAX = 1024;

export const NO_FAULT_TEXT = '';

export const VACUUM_ACTIVE_FAULT = z.looseObject({
  code: z.number().int().nonnegative(),
  title: z.string().default(''),
  hint: z.string().default(''),
  canHelp: z.boolean().default(false),
  since: z.string().optional(),
});

export type VacuumActiveFault = z.infer<typeof VACUUM_ACTIVE_FAULT>;

export function vacuumFaultText(fault: VacuumActiveFault | null): string {
  if (fault === null) return NO_FAULT_TEXT;
  const { code, title, hint, canHelp, since } = fault;
  return JSON.stringify({ code, title, hint, canHelp, ...(since === undefined ? {} : { since }) });
}

function decodedText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function parseVacuumFault(value: JsonValue | undefined): VacuumActiveFault | null {
  if (typeof value !== 'string' || value === NO_FAULT_TEXT) return null;
  const parsed = VACUUM_ACTIVE_FAULT.safeParse(decodedText(value));
  return parsed.success ? parsed.data : null;
}
