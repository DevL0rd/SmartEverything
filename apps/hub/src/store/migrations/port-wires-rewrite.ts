import { JSON_VALUE, WIRE } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';

const FORMULA_KEYS: readonly string[] = ['expr', 'tpl'];

export interface Rewritten {
  readonly value: JsonValue;
  readonly wires: number;
  readonly formulas: readonly string[];
}

export class FormulaLeftError extends Error {
  override readonly name = 'FormulaLeftError';

  constructor(readonly owners: readonly string[]) {
    super(
      `Stored automations still hold formulas that are not a plain node.port path, so nothing was migrated: ${owners.join('; ')}.`,
    );
  }
}

type JsonObject = Readonly<Record<string, JsonValue>>;

interface Walk {
  readonly wires: string[];
  readonly formulas: string[];
}

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isFormula(value: JsonObject): boolean {
  return Object.keys(value).some((key) => FORMULA_KEYS.includes(key));
}

function wired(value: JsonObject, walk: Walk): JsonValue {
  const path = value['expr'];
  if (Object.keys(value).length !== 1 || typeof path !== 'string') {
    walk.formulas.push(JSON.stringify(value));
    return value;
  }
  const [from, ...rest] = path.split('.');
  const parsed = WIRE.safeParse({ from, port: rest.join('.') });
  if (!parsed.success) {
    walk.formulas.push(path);
    return value;
  }
  walk.wires.push(path);
  return { wire: parsed.data };
}

function rewrite(value: JsonValue, walk: Walk): JsonValue {
  if (isList(value)) return value.map((item) => rewrite(item, walk));
  if (value === null || typeof value !== 'object') return value;
  if (isFormula(value)) return wired(value, walk);
  return Object.fromEntries(
    Object.entries(value).map(([key, member]) => [key, rewrite(member, walk)]),
  );
}

export function rewriteText(text: string): Rewritten {
  const walk: Walk = { wires: [], formulas: [] };
  const parsed: unknown = JSON.parse(text);
  const value = rewrite(JSON_VALUE.parse(parsed), walk);
  return { value, wires: walk.wires.length, formulas: walk.formulas };
}
