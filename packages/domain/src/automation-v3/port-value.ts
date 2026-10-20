import { z } from 'zod';
import { JSON_VALUE } from '../values';
import { IDENT_PATTERN } from './ident';

const NAME = z.string().regex(IDENT_PATTERN, 'a name is a plain identifier such as count');

export const WIRE = z.strictObject({ from: NAME, port: NAME });

export const PORT_VALUE = z.union([
  z.strictObject({ lit: JSON_VALUE }),
  z.strictObject({ wire: WIRE }),
]);

export type Wire = z.infer<typeof WIRE>;
export type PortValue = z.infer<typeof PORT_VALUE>;

export function wire(from: string, port: string): PortValue {
  return { wire: { from, port } };
}
