import { errorCodeOf, openRouterError, readAs, readJson, type OpenRouterErrorCode } from './errors';
import { OR_CHUNK, type OrChunk } from './wire';

function streamErrorCode(code: number | string): OpenRouterErrorCode {
  return typeof code === 'number' ? errorCodeOf(code) : 'unavailable';
}

export function parseChunk(data: string): OrChunk {
  const json = readJson(data);
  if (!json.ok) {
    throw openRouterError('unreadable', `a stream line wasn’t JSON: ${json.reason}`);
  }
  const chunk = readAs(OR_CHUNK, json.value, 'stream chunk');
  const { error } = chunk;
  if (error !== undefined) {
    throw openRouterError(streamErrorCode(error.code), error.message);
  }
  return chunk;
}
