import { z } from 'zod';
import { JSON_VALUE, type JsonValue } from './values';

function matchingReference(value: Readonly<Record<string, JsonValue>>, id: string): boolean {
  if (['valueId', 'choiceId', 'sequenceId', 'groupId', 'roomId'].some((key) => value[key] === id))
    return true;
  if (deviceSelectionReference(value, id)) return true;
  if (literalChoiceReference(value, id)) return true;
  if (value['kind'] === 'choice') {
    const operation = value['operation'];
    const parsed = z.record(z.string(), JSON_VALUE).safeParse(operation);
    if (parsed.success) return parsed.data['value'] === id;
  }
  if (value['type'] !== 'value' && value['type'] !== 'binding') return false;
  const comparison = value['comparison'];
  const parsed = z.record(z.string(), JSON_VALUE).safeParse(comparison);
  return parsed.success && parsed.data['value'] === id;
}
export function automationReferences(value: JsonValue, id: string): boolean {
  if (Array.isArray(value))
    return value.some((entry) => automationReferences(JSON_VALUE.parse(entry), id));
  const record = z.record(z.string(), JSON_VALUE).safeParse(value);
  if (!record.success) return false;
  const entries = record.data;
  return (
    matchingReference(entries, id) ||
    Object.values(entries).some((entry) => automationReferences(entry, id))
  );
}

function literalChoiceReference(value: Readonly<Record<string, JsonValue>>, id: string): boolean {
  return value['source'] === 'literal' && value['kind'] === 'choice' && value['value'] === id;
}

function deviceSelectionReference(value: Readonly<Record<string, JsonValue>>, id: string): boolean {
  const ids = value['deviceIds'];
  return value['kind'] === 'devices' && Array.isArray(ids) && ids.includes(id);
}
