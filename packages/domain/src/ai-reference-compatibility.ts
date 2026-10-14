import { z } from 'zod';
import type { AssistantMessageRow } from './assistant';
import type { LiveChange } from './api/live';

export const AI_REFERENCE_CAPABILITY = 'ai-references-v1';
export const AI_REFERENCE_HEADER_VALUE = 'application/json; smarteverything-ai-references=1';
const RECORD = z.record(z.string(), z.unknown());
type ReferenceEnvelope = 'message' | 'messages' | 'snapshot' | 'opaque';

export function aiReferenceProjection(
  value: unknown,
  accepted: boolean,
  envelope: ReferenceEnvelope,
): unknown {
  if (accepted) return value;
  switch (envelope) {
    case 'message':
      return messageProjection(value);
    case 'messages':
      return messagesProjection(value);
    case 'snapshot':
      return snapshotProjection(value);
    case 'opaque':
      return value;
  }
}
function messageProjection(value: unknown): unknown {
  const parsed = RECORD.safeParse(value);
  if (!parsed.success) return value;
  const result = { ...parsed.data };
  delete result['references'];
  return result;
}
function messagesProjection(value: unknown): unknown {
  return Array.isArray(value) ? value.map(messageProjection) : value;
}
function snapshotProjection(value: unknown): unknown {
  const parsed = RECORD.safeParse(value);
  if (!parsed.success) return value;
  const tables = RECORD.safeParse(parsed.data['tables']);
  if (!tables.success || tables.data['assistant_messages'] === undefined) return value;
  return {
    ...parsed.data,
    tables: {
      ...tables.data,
      assistant_messages: messagesProjection(tables.data['assistant_messages']),
    },
  };
}
export function aiReferenceChange(change: LiveChange, accepted: boolean): LiveChange {
  if (accepted || change.table !== 'assistant_messages') return change;
  return {
    ...change,
    record: change.record === null ? null : withoutMessageReferences(change.record),
    oldRecord: change.oldRecord === null ? null : withoutMessageReferences(change.oldRecord),
  };
}
function withoutMessageReferences(message: AssistantMessageRow): AssistantMessageRow {
  const result = { ...message };
  delete result.references;
  return result;
}
