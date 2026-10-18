import { ApiError, type TranscriptSource } from '@smarteverything/domain';
import { roleOfCaller, type Caller } from '../server/auth';
import type { Store } from '../store/store';
import { personOfDevice } from '../listening/listening-rows';
import { profileIdOf } from '../server/auth';
import type { TranscriptScope } from '../store/repositories/transcript-reader';

export interface TranscriptSelection {
  readonly source?: TranscriptSource | undefined;
  readonly sourceId?: string | undefined;
  readonly sessionId?: string | undefined;
}

export function admitTranscriptCaller(caller: Caller): void {
  if (caller.kind !== 'client' && caller.kind !== 'service')
    throw new ApiError('forbidden', 'A paired app or issued service grant is required.');
}

function assistantCaller(caller: Caller): boolean {
  return caller.kind === 'service' || (caller.kind === 'client' && caller.via === 'assistant');
}

export function admitTranscriptReader(caller: Caller): void {
  admitTranscriptCaller(caller);
  if (assistantCaller(caller) && roleOfCaller(caller) !== 'owner')
    throw new ApiError('forbidden', 'Only the home owner’s AI reads camera transcripts.');
}

export function admitTranscriptSource(
  store: Store,
  caller: Caller,
  source: TranscriptSource,
  sourceId: string | undefined,
): void {
  if (roleOfCaller(caller) === 'owner') return;
  if (source === 'plugin') {
    throw new ApiError('forbidden', 'Only the owner reads plugin speech.');
  }
  if (source === 'camera') {
    if (assistantCaller(caller))
      throw new ApiError(
        'forbidden',
        'A member’s AI reads only speech from that member’s own phone or computer.',
      );
    return;
  }
  const device = sourceId === undefined ? undefined : store.devices.find(sourceId);
  if (device === undefined || personOfDevice(store, device) !== profileIdOf(store, caller)) {
    throw new ApiError('forbidden', `Members read only the speech of their own ${source}.`);
  }
}

export function admittedSource(
  store: Store,
  caller: Caller,
  asked: TranscriptSource | undefined,
  sourceId: string | undefined,
): TranscriptSource | undefined {
  const source = asked ?? (roleOfCaller(caller) === 'owner' ? undefined : 'camera');
  if (source !== undefined) admitTranscriptSource(store, caller, source, sourceId);
  return source;
}

export function transcriptReaderScope(
  store: Store,
  caller: Caller,
  selection: TranscriptSelection,
): TranscriptScope {
  admitTranscriptCaller(caller);
  if (selection.sessionId === undefined) {
    const source = selection.source ?? 'camera';
    admitTranscriptSource(store, caller, source, selection.sourceId);
    return {
      source,
      ...(selection.sourceId === undefined ? {} : { sourceIds: [selection.sourceId] }),
    };
  }
  if (selection.source !== undefined || selection.sourceId !== undefined)
    throw new ApiError('invalid_request', 'Select a session or a source, not both.');
  const session = store.transcripts.byId(selection.sessionId);
  admitTranscriptSource(store, caller, session.source, session.source_id);
  return { source: session.source, sessionId: session.id };
}
