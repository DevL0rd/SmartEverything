import type { IncomingHttpHeaders } from 'node:http';
import {
  ApiError,
  AI_CHAT_ROW,
  AI_ENGINE_HEADER,
  AI_HARNESS_HEADER_VALUE,
  AI_ENGINE_HEADER_VALUE,
  AI_ENGINE_HEADER_VALUE_V2,
  type LiveChange,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../store/store';

export const UNAVAILABLE_COMPUTER_MODEL = 'smarteverything/unavailable-computer-engine';
const UNAVAILABLE_ENGINE = {
  kind: 'openrouter',
  model: UNAVAILABLE_COMPUTER_MODEL,
  effort: null,
} as const;
const RECORD = z.record(z.string(), z.unknown());
const ENGINE_BODY = z.object({ engine: z.object({ kind: z.string() }).nullable().optional() });
const CREATES_CHAT = new Set([
  'createAiChat',
  'sendAssistantMessage',
  'createAiSubagent',
  'runAiSubagent',
  'branchAiChat',
  'postAssistant',
]);

export type EngineReader = 'legacy' | 'v1' | 'v2' | 'harness';
export function engineReader(headers: IncomingHttpHeaders): EngineReader {
  const value = headers[AI_ENGINE_HEADER];
  if (
    typeof value === 'string' &&
    value
      .split(',')
      .map((part) => part.trim())
      .includes(AI_HARNESS_HEADER_VALUE)
  )
    return 'harness';
  if (typeof value !== 'string') return 'legacy';
  const accepted = value.split(',').map((part) => part.trim());
  if (accepted.includes(AI_ENGINE_HEADER_VALUE_V2)) return 'v2';
  return accepted.includes(AI_ENGINE_HEADER_VALUE) ? 'v1' : 'legacy';
}
export function understandsComputerEngines(headers: IncomingHttpHeaders): boolean {
  return engineReader(headers) !== 'legacy';
}
function supported(kind: string, reader: EngineReader): boolean {
  return (
    kind === 'openrouter' ||
    (kind === 'claude' && reader !== 'legacy') ||
    (kind === 'codex' && (reader === 'v2' || reader === 'harness')) ||
    (kind === 'dsh' && reader === 'harness')
  );
}
export function engineProjection(value: unknown, reader: EngineReader): unknown {
  if (reader === 'harness') return value;
  const chat = AI_CHAT_ROW.safeParse(value);
  if (chat.success && !supported(chat.data.engine.kind, reader))
    return {
      ...chat.data,
      title: `[Update required] ${chat.data.title}`.slice(0, 80),
      engine: UNAVAILABLE_ENGINE,
    };
  const kind = z.object({ kind: z.string() }).safeParse(value);
  if (
    kind.success &&
    ['claude', 'codex', 'dsh'].includes(kind.data.kind) &&
    !supported(kind.data.kind, reader)
  )
    return UNAVAILABLE_ENGINE;
  if (Array.isArray(value))
    return value
      .filter(
        (item: unknown) =>
          reader === 'v2' || !z.object({ runtime: z.literal('codex') }).safeParse(item).success,
      )
      .map((item: unknown) => engineProjection(item, reader));
  const record = RECORD.safeParse(value);
  if (!record.success) return value;
  const entries = Object.entries(record.data).filter(
    ([key]) => reader === 'v2' || (key !== 'runtime' && key !== 'context'),
  );
  return Object.fromEntries(entries.map(([key, item]) => [key, engineProjection(item, reader)]));
}
export function legacyEngineProjection(value: unknown): unknown {
  return engineProjection(value, 'legacy');
}
export function readerEngineChange(change: LiveChange, reader: EngineReader): LiveChange {
  if (change.table !== 'ai_chats') return change;
  return {
    ...change,
    record:
      change.record === null ? null : AI_CHAT_ROW.parse(engineProjection(change.record, reader)),
    oldRecord:
      change.oldRecord === null
        ? null
        : AI_CHAT_ROW.parse(engineProjection(change.oldRecord, reader)),
  };
}
export function legacyEngineChange(change: LiveChange): LiveChange | null {
  return readerEngineChange(change, 'legacy');
}
function unsupportedBody(body: unknown, reader: EngineReader): boolean {
  const input = ENGINE_BODY.safeParse(body);
  const requested = input.success ? input.data.engine : undefined;
  if (requested !== null && requested !== undefined && !supported(requested.kind, reader))
    return true;
  const runtime = z.object({ runtime: z.literal('codex') }).safeParse(body);
  return runtime.success && reader !== 'v2' && reader !== 'harness';
}
function unsupportedTarget(
  store: Store,
  params: Readonly<Record<string, string>>,
  reader: EngineReader,
): boolean {
  const runtime = params['runtime'];
  if (runtime !== undefined && !supported(runtime, reader)) return true;
  const chatId = params['chatId'];
  return chatId !== undefined && !supported(store.aiChats.chat(chatId).engine.kind, reader);
}
function unsupportedDefault(
  store: Store,
  name: string,
  params: Readonly<Record<string, string>>,
  input: { readonly body: unknown; readonly reader: EngineReader },
): boolean {
  if (!CREATES_CHAT.has(name) || params['chatId'] !== undefined) return false;
  const parsed = ENGINE_BODY.safeParse(input.body);
  if (parsed.success && parsed.data.engine !== undefined) return false;
  const engine = store.aiEngineDefaults.read();
  return engine !== null && !supported(engine.kind, input.reader);
}
export function assertReaderEngineWrite(
  store: Store,
  name: string,
  params: Readonly<Record<string, string>>,
  input: { readonly body: unknown; readonly reader: EngineReader },
): void {
  if (
    unsupportedBody(input.body, input.reader) ||
    unsupportedTarget(store, params, input.reader) ||
    unsupportedDefault(store, name, params, input)
  )
    throw new ApiError(
      'conflict',
      'This app cannot represent the selected computer AI engine. Update the app before submitting work; no work was submitted.',
    );
}
export function assertLegacyEngineWrite(
  store: Store,
  name: string,
  params: Readonly<Record<string, string>>,
  body: unknown,
): void {
  assertReaderEngineWrite(store, name, params, { body, reader: 'legacy' });
}

export function legacyTargetChat(
  store: Store,
  name: string,
  params: Readonly<Record<string, string>>,
  profileId: string | null,
): string | undefined {
  if (params['chatId'] !== undefined) return params['chatId'];
  if (name === 'removeAssistantMessage' && params['messageId'] !== undefined)
    return store.assistantChat.message(params['messageId']).chat_id;
  if (
    profileId !== null &&
    (name === 'sendAssistantMessage' ||
      name === 'clearAssistantMessages' ||
      name === 'postAssistant')
  )
    return store.aiChats.latest(profileId)?.id;
  return undefined;
}

export function memberEngineProjection(value: unknown): unknown {
  const engine = z.object({ kind: z.enum(['claude', 'codex']) }).safeParse(value);
  if (engine.success) {
    const parsed = RECORD.parse(value);
    return { ...parsed, settings: engine.data.kind === 'claude' ? { builtin_tools: [] } : {} };
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
