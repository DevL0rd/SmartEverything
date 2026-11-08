import { FINISH_TOKENS } from './materials';

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export const FINISH_TOKEN_HASH = fnv(JSON.stringify(FINISH_TOKENS));
