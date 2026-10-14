import { z } from 'zod';
import { COMPUTER_AI_CAPABILITIES } from './computer-ai';
import { COMPUTER_RUNTIME_CAPABILITIES, PROVIDER_EXECUTION_CONTEXT } from './computer-ai-runtime';
export const NATIVE_MANAGED_PROJECT_HEADER_VALUE =
  'application/json; smarteverything-native-managed-projects=1';
const RECORD = z.record(z.string(), z.unknown());
export function nativeProjectProjection(value: unknown, accepted: boolean): unknown {
  if (accepted) return value;
  if (Array.isArray(value))
    return value.map((item: unknown) => nativeProjectProjection(item, false));
  const parsed = RECORD.safeParse(value);
  if (!parsed.success) return value;
  const record = parsed.data;
  if (
    COMPUTER_RUNTIME_CAPABILITIES.safeParse(value).success ||
    COMPUTER_AI_CAPABILITIES.safeParse(value).success
  ) {
    const { managed_projects: _projects, ...capabilities } = record;
    return capabilities;
  }
  if (PROVIDER_EXECUTION_CONTEXT.safeParse(value).success) {
    const { managed_project: _project, ...context } = record;
    return context;
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, nativeProjectProjection(item, false)]),
  );
}
