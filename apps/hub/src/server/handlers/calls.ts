import { API_ENDPOINTS as E, ApiError, type CallRow } from '@smarteverything/domain';
import type { AssistantVoice } from '../../assistant-voice/assistant-voice';
import { SightError } from '../../assistant-voice/sight-error';
import { NoSuchCallError } from '../../assistant-voice/video';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

export type CallRoutes = Record<'listCalls' | 'showCameraInCall' | 'stopSightInCall', Bound>;

function visible(context: ServerContext, caller: Caller, row: CallRow): boolean {
  return clientOf(caller).role === 'owner' || row.profileId === profileIdOf(context.store, caller);
}

function refusing<T>(work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof NoSuchCallError) {
      throw new ApiError('not_found', cause.message);
    }
    if (cause instanceof SightError) {
      throw new ApiError('conflict', cause.message);
    }
    throw cause;
  }
}

export function callRoutes(context: ServerContext, voice: AssistantVoice): CallRoutes {
  const calls = voice.sightCalls;
  const own = (callId: string, caller: Caller): void => {
    const row = calls.rows().find((candidate) => candidate.callId === callId);
    if (row === undefined || !visible(context, caller, row)) {
      throw new ApiError('not_found', `There is no call ${callId} of yours running.`);
    }
  };
  return {
    listCalls: bound(E.listCalls, ({ caller }) =>
      calls.rows().filter((row) => visible(context, caller, row)),
    ),
    showCameraInCall: bound(E.showCameraInCall, ({ params, body, caller }) => {
      own(params.callId, caller);
      return refusing(() => calls.show(params.callId, body.cameraId));
    }),
    stopSightInCall: bound(E.stopSightInCall, ({ params, caller }) => {
      own(params.callId, caller);
      return refusing(() => calls.stop(params.callId));
    }),
  };
}
