import type { IncomingHttpHeaders } from 'node:http';
import { AI_REFERENCE_HEADER_VALUE, aiReferenceProjection } from '@smarteverything/domain';
import { nativeProjectResponse } from './native-project-compatibility';
import { engineProjection, type EngineReader } from './engine-compatibility';

const MESSAGE_ENDPOINTS: ReadonlySet<string> = new Set([
  'sendAssistantMessage',
  'sendAiChatMessage',
  'retryAiChatMessage',
  'editAiChatMessage',
  'postAssistant',
]);
const MESSAGE_LIST_ENDPOINTS: ReadonlySet<string> = new Set([
  'listAssistantMessages',
  'listAiChatMessages',
]);
export function clientResponse(
  value: unknown,
  headers: IncomingHttpHeaders,
  endpoint: string,
  reader: EngineReader,
): unknown {
  const accept = headers.accept;
  const accepted =
    typeof accept === 'string' &&
    accept
      .split(',')
      .map((part) => part.trim())
      .includes(AI_REFERENCE_HEADER_VALUE);
  return engineProjection(
    aiReferenceProjection(
      nativeProjectResponse(value, headers, endpoint),
      accepted,
      envelopeFor(endpoint),
    ),
    reader,
  );
}
function envelopeFor(endpoint: string): Parameters<typeof aiReferenceProjection>[2] {
  if (MESSAGE_ENDPOINTS.has(endpoint)) return 'message';
  if (MESSAGE_LIST_ENDPOINTS.has(endpoint)) return 'messages';
  return endpoint === 'readSnapshot' ? 'snapshot' : 'opaque';
}
