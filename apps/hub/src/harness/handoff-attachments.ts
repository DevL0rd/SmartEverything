import { z } from 'zod';
import { ApiError, JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue, AiHarnessSession } from '@smarteverything/domain';
import type { HarnessService } from './service';
export function handoffAttachments(
  service: HarnessService,
  session: AiHarnessSession,
): readonly JsonValue[] {
  const grant = service.storage.grant(session.session_id);
  const refs = new Map<string, JsonValue>();
  for (let offset = 0; offset < session.metadata.next_seq; offset += 10_000) {
    const page = service.store.dshSessions.read(
      { session_id: session.session_id, offset, limit: 10_000 },
      grant.profile_id,
    );
    for (const event of page.events) collect(event.data, refs);
  }
  if (refs.size > 1000)
    throw new ApiError(
      'conflict',
      'This native history exceeds the bounded target attachment verification request.',
    );
  return [...refs.values()];
}
const NATIVE_ATTACHMENT = z.object({ type: z.enum(['image', 'file']), attachment: JSON_VALUE });
function collect(value: JsonValue, refs: Map<string, JsonValue>): void {
  if (isJsonArray(value)) {
    for (const item of value) collect(item, refs);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const ref = NATIVE_ATTACHMENT.safeParse(value);
  if (ref.success) refs.set(JSON.stringify(ref.data), ref.data);
  for (const item of Object.values(value)) collect(item, refs);
}
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}
