import { buildForkSeed, SessionSeq } from '@deepseek-ai/dsh-session';
import { nativeEvents, nativeHeader } from '../persistence/validation';
export function readNativeHistory(
  header: unknown,
  events: unknown,
): ReturnType<typeof nativeEvents> {
  return nativeEvents(nativeHeader(header), events);
}
export function forkNativeHistory(
  header: unknown,
  events: unknown,
  boundary: number,
): ReturnType<typeof buildForkSeed> {
  return buildForkSeed(readNativeHistory(header, events), SessionSeq(boundary));
}
