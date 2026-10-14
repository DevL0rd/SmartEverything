import { z } from 'zod';
export const NATIVE_MANAGED_PROJECT_HEADER_VALUE =
  'application/json; smarteverything-native-managed-projects=1';
type Envelope = 'status' | 'catalogue' | 'provider' | 'node' | 'reply' | 'context' | 'opaque';
const RECORD = z.record(z.string(), z.unknown());
type Projection = (value: unknown) => unknown;
export function nativeProjectProjection(
  value: unknown,
  accepted: boolean,
  envelope: Envelope = 'status',
): unknown {
  if (accepted) return value;
  switch (envelope) {
    case 'status':
      return projectStatus(value);
    case 'catalogue':
      return fields(value, [['computers', projectStatuses]]);
    case 'provider':
      return fields(strip(value, 'managed_project'), [['context', projectContext]]);
    case 'context':
      return projectContext(value);
    case 'node':
      return projectNode(value);
    case 'reply':
      return projectRuntimeReply(value);
    case 'opaque':
      return value;
  }
}
function projectStatus(value: unknown): unknown {
  return fields(value, [
    ['capabilities', (capabilities: unknown): unknown => strip(capabilities, 'managed_projects')],
    ['context', projectContext],
  ]);
}
function projectStatuses(value: unknown): unknown {
  return Array.isArray(value) ? value.map(projectStatus) : value;
}
function projectContext(value: unknown): unknown {
  return strip(value, 'managed_project');
}
function projectNode(value: unknown): unknown {
  const record = RECORD.safeParse(value);
  if (!record.success) return value;
  switch (record.data['type']) {
    case 'capabilities':
      return fields(value, [
        [
          'capabilities',
          (capabilities: unknown): unknown => strip(capabilities, 'managed_projects'),
        ],
      ]);
    case 'reply':
      return fields(value, [
        ['result', (result: unknown): unknown => fields(result, [['reply', projectRuntimeReply]])],
      ]);
    case 'provider_event':
      return fields(value, [['payload', projectProviderEnvelope]]);
    default:
      return value;
  }
}
function projectProviderEnvelope(value: unknown): unknown {
  return fields(value, [['event', projectProviderEvent]]);
}
function projectProviderEvent(value: unknown): unknown {
  const record = RECORD.safeParse(value);
  if (!record.success || record.data['kind'] !== 'context') return value;
  return fields(value, [['context', projectContext]]);
}
function projectRuntimeReply(value: unknown): unknown {
  const record = RECORD.safeParse(value);
  if (!record.success) return value;
  if (record.data['runtime'] === 'claude' || record.data['runtime'] === 'codex')
    return fields(value, [['reply', projectNativeReply]]);
  return projectNativeReply(value);
}
function projectNativeReply(value: unknown): unknown {
  const record = RECORD.safeParse(value);
  if (!record.success) return value;
  switch (record.data['operation']) {
    case 'status':
      return fields(value, [['value', projectStatus]]);
    default:
      return value;
  }
}
function fields(value: unknown, projections: readonly (readonly [string, Projection])[]): unknown {
  const parsed = RECORD.safeParse(value);
  if (!parsed.success) return value;
  const result = { ...parsed.data };
  for (const [key, project] of projections)
    if (result[key] !== undefined) result[key] = project(result[key]);
  return result;
}
function strip(value: unknown, key: string): unknown {
  const parsed = RECORD.safeParse(value);
  if (!parsed.success) return value;
  return Object.fromEntries(Object.entries(parsed.data).filter(([name]) => name !== key));
}
