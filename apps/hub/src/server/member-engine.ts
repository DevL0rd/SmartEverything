import { AI_CHAT_ROW, type LiveChange } from '@smarteverything/domain';

const NATIVE_ENGINES: ReadonlySet<unknown> = new Set(['claude', 'codex']);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function memberEngineProjection(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item: unknown) => memberEngineProjection(item));
  if (!isRecord(value)) return value;
  if (NATIVE_ENGINES.has(value['kind'])) {
    return { ...value, settings: value['kind'] === 'claude' ? { builtin_tools: [] } : {} };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, memberEngineProjection(item)]),
  );
}

export function memberEngineChange(change: LiveChange): LiveChange {
  if (change.table !== 'ai_chats') return change;
  return {
    ...change,
    record:
      change.record === null ? null : AI_CHAT_ROW.parse(memberEngineProjection(change.record)),
    oldRecord:
      change.oldRecord === null
        ? null
        : AI_CHAT_ROW.parse(memberEngineProjection(change.oldRecord)),
  };
}
