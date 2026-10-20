import type { JsonValue } from '@smarteverything/domain';
import type { ComputerEvent } from './provider-state';

type JsonRecord = Readonly<Record<string, JsonValue>>;

function record(value: JsonValue | undefined): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

function emptiedResult(block: JsonValue): JsonValue {
  const item = record(block);
  if (item?.['type'] !== 'tool_result') return block;
  return { ...item, content: '' };
}

function emptiedUserPayload(payload: JsonRecord): JsonRecord {
  const { tool_use_result: _dropped, ...rest } = payload;
  const message = record(rest['message']);
  const content = message?.['content'];
  if (message === null || !Array.isArray(content)) return rest;
  return { ...rest, message: { ...message, content: content.map(emptiedResult) } };
}

export function noticeEvent(event: ComputerEvent): ComputerEvent {
  if (event.kind === 'tool_result') return { ...event, text: '' };
  if (event.kind === 'runtime' && event.type === 'user')
    return { ...event, payload: emptiedUserPayload(event.payload) };
  return event;
}
