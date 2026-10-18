import { API_ENDPOINTS as E, ApiError, type CallRow } from '@smarteverything/domain';
import type { AssistantVoice } from '../../assistant-voice/assistant-voice';
import { SightError } from '../../assistant-voice/sight-error';
import { NoSuchCallError } from '../../assistant-voice/video';
import { clientOf, isOwnerOrSelf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';

function visible(context: ServerContext, caller: Caller, row: CallRow): boolean {
  return isOwnerOrSelf(clientOf(caller).role, row.profileId === profileIdOf(context.store, caller));
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

function own(
  context: ServerContext,
  calls: AssistantVoice['sightCalls'],
  callId: string,
  caller: Caller,
): void {
  const row = calls.rows().find((candidate) => candidate.callId === callId);
  if (row === undefined || !visible(context, caller, row)) {
    throw new ApiError('not_found', `There is no call ${callId} of yours running.`);
  }
}

export const callRoutes = (context: ServerContext, { sightCalls: calls }: AssistantVoice) =>
  ({
    listCalls: bound(E.listCalls, ({ caller }) =>
      calls.rows().filter((row) => visible(context, caller, row)),
    ),
    showCameraInCall: bound(E.showCameraInCall, ({ params, body, caller }) => {
      own(context, calls, params.callId, caller);
      return refusing(() => calls.show(params.callId, body.cameraId));
    }),
    stopSightInCall: bound(E.stopSightInCall, ({ params, caller }) => {
      own(context, calls, params.callId, caller);
      return refusing(() => calls.stop(params.callId));
    }),
  }) as const;
