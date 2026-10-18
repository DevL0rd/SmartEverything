import { z } from 'zod';
import type { ShellyPage } from './pages';

export interface ShellyDispatch {
  readonly key: 'config' | 'setting';
  readonly methods: Readonly<Record<string, string>>;
}
export interface ShellyOperation {
  readonly method: string;
  readonly title: string;
  readonly page: ShellyPage;
  readonly group: string;
  readonly owner: boolean;
  readonly revisioned: boolean;
  readonly keywords: readonly string[];
  readonly dispatch: ShellyDispatch | null;
  readonly params: z.ZodObject<z.ZodRawShape, z.core.$strict>;
}

export function operation(
  method: string,
  title: string,
  place: readonly [page: ShellyPage, group: string],
  shape: z.ZodRawShape,
): ShellyOperation {
  return {
    method,
    title,
    page: place[0],
    group: place[1],
    owner: true,
    revisioned: false,
    keywords: [],
    dispatch: null,
    params: z.strictObject(shape),
  };
}
export function member(row: ShellyOperation): ShellyOperation {
  return { ...row, owner: false };
}
export function revisioned(row: ShellyOperation): ShellyOperation {
  return { ...row, revisioned: true };
}
export function keyworded(row: ShellyOperation, keywords: readonly string[]): ShellyOperation {
  return { ...row, keywords };
}
export function dispatching(
  row: ShellyOperation,
  key: ShellyDispatch['key'],
  methods: ShellyDispatch['methods'],
): ShellyOperation {
  return { ...row, dispatch: { key, methods } };
}
