import { ApiError, type TranscriptSession } from '@smarteverything/domain';
import type { Caller } from '../server/auth';
import type { TranscriptFilter } from './transcript-service';

function cameraAreaCaller(caller: Caller): boolean {
  return (
    caller.kind === 'service' ||
    (caller.kind === 'client' &&
      (caller.via === 'assistant' ||
        caller.mcpOrigin !== undefined ||
        caller.pluginId !== undefined))
  );
}
export function legacyTranscriptFilter(caller: Caller, filter: TranscriptFilter): TranscriptFilter {
  if (!cameraAreaCaller(caller)) return filter;
  if (filter.source === 'plugin')
    throw new ApiError(
      'forbidden',
      'Read plugin conversation history through that plugin’s own tools.',
    );
  return { ...filter, source: 'camera' };
}
export function admitLegacyTranscript(caller: Caller, session: TranscriptSession): void {
  if (cameraAreaCaller(caller) && session.source === 'plugin')
    throw new ApiError(
      'forbidden',
      'Plugin conversation history is outside the camera tool grant.',
    );
}
