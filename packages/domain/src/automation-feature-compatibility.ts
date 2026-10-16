import { ROW_CHANGE, type LiveChange } from './api/live';
import { z } from 'zod';
import { ApiError } from './api/errors';
import { JSON_VALUE, type JsonValue } from './values';

export interface AutomationFeatures {
  readonly effects: boolean;
  readonly speech: boolean;
}
const RECORD = z.record(z.string(), JSON_VALUE);
function actionNeedsEffects(action: JsonValue): boolean {
  const parsed = RECORD.safeParse(action);
  if (!parsed.success) return false;
  const row = parsed.data;
  if (row['type'] === 'temporary_effect') return true;
  const arrays = [row['actions'], row['otherwise'], row['branches']];
  return arrays.some(
    (value) =>
      Array.isArray(value) && value.some((child) => actionNeedsEffects(JSON_VALUE.parse(child))),
  );
}
export function automationFeatureVisible(value: unknown, features: AutomationFeatures): boolean {
  const parsed = z.object({ definition: RECORD }).safeParse(value);
  if (!parsed.success) return true;
  const definition = parsed.data.definition;
  const actions = definition['actions'];
  if (
    !features.effects &&
    Array.isArray(actions) &&
    actions.some((action) => actionNeedsEffects(JSON_VALUE.parse(action)))
  )
    return false;
  const triggers = definition['triggers'];
  return (
    features.speech ||
    !Array.isArray(triggers) ||
    !triggers.some((trigger) => {
      const row = RECORD.safeParse(trigger);
      return row.success && row.data['type'] === 'speech';
    })
  );
}
function featureSnapshot(
  record: Readonly<Record<string, unknown>>,
  features: AutomationFeatures,
): unknown {
  const tables = z.record(z.string(), z.unknown()).parse(record['tables']);
  const filter = (rows: unknown): unknown =>
    Array.isArray(rows) ? rows.filter((row) => automationFeatureVisible(row, features)) : rows;
  return {
    ...record,
    tables: {
      ...tables,
      automations: filter(tables['automations']),
      ...(tables['automation_sequences'] === undefined
        ? {}
        : { automation_sequences: filter(tables['automation_sequences']) }),
    },
  };
}
function visibleRecord(value: unknown, features: AutomationFeatures): boolean {
  return value !== null && automationFeatureVisible(value, features);
}
export function automationFeatureChange(
  change: LiveChange,
  features: AutomationFeatures,
): LiveChange | null {
  if (change.table !== 'automations' && change.table !== 'automation_sequences') return change;
  const before = visibleRecord(change.oldRecord, features);
  const after = visibleRecord(change.record, features);
  if (!before && !after) return null;
  if (before && after) return change;
  const row = ROW_CHANGE.parse({
    ...change,
    operation: after ? 'INSERT' : 'DELETE',
    record: after ? change.record : null,
    oldRecord: before ? change.oldRecord : null,
  });
  return { ...row, seq: change.seq };
}
export function automationFeatureResponse(
  value: unknown,
  features: AutomationFeatures,
  endpoint: string,
): unknown {
  if (features.effects && features.speech) return value;
  if (
    ![
      'listAutomations',
      'listAutomationSequences',
      'readAutomationSequence',
      'readAutomationRevision',
      'readSnapshot',
    ].includes(endpoint)
  )
    return value;
  if (Array.isArray(value)) return value.filter((row) => automationFeatureVisible(row, features));
  const record = z.record(z.string(), z.unknown()).safeParse(value);
  if (!record.success) return value;
  if (!automationFeatureVisible(value, features))
    throw new ApiError('conflict', 'Update the app to read this automation program.');
  if (
    endpoint === 'readAutomationRevision' &&
    !automationFeatureVisible(record.data['automation'], features)
  )
    throw new ApiError('conflict', 'Update the app to read this automation program.');
  if (endpoint !== 'readSnapshot') return value;
  return featureSnapshot(record.data, features);
}
