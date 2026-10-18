import { AI_CHAT_ROW, type LiveChange } from '@smarteverything/domain';
import { z } from 'zod';

const RECORD = z.record(z.string(), z.unknown());
const NATIVE_ENGINE = z.object({ kind: z.enum(['claude', 'codex']) });

export function memberEngineProjection(value: unknown): unknown {
  const engine = NATIVE_ENGINE.safeParse(value);
  if (engine.success) {
    return {
      ...RECORD.parse(value),
      settings: engine.data.kind === 'claude' ? { builtin_tools: [] } : {},
    };
  }
  if (Array.isArray(value)) return value.map((item: unknown) => memberEngineProjection(item));
  const record = RECORD.safeParse(value);
  if (!record.success) return value;
  return Object.fromEntries(
    Object.entries(record.data).map(([key, item]) => [key, memberEngineProjection(item)]),
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
