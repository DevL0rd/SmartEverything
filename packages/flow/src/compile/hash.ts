import { sha256Hex } from '../functions/sha256';
import type { Plan } from './plan';

function sortKeys(_key: string, value: unknown): unknown {
  if (!(value instanceof Object) || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}

export function canonicalPlan(plan: Plan): string {
  return JSON.stringify(plan, sortKeys);
}

export function hashPlan(plan: Plan): string {
  return sha256Hex(canonicalPlan(plan));
}
