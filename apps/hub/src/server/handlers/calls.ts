import { API_ENDPOINTS as E, ApiError, type CallRow } from '@smarteverything/domain';
import type { AssistantVoice } from '../../assistant-voice/assistant-voice';
import { SightError } from '../../assistant-voice/sight-error';
import { NoSuchCallError } from '../../assistant-voice/video';
import { clientOf, isOwnerOrSelf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';
import { chosenCall } from './call-choice';

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

function ownCall(
  context: ServerContext,
  calls: AssistantVoice['sightCalls'],
  caller: Caller,
  requested: string | undefined,
): string {
  return chosenCall(
    calls.rows().filter((candidate) => visible(context, caller, candidate)),
    requested,
  );
}

export const callRoutes = (context: ServerContext, { sightCalls: calls }: AssistantVoice) =>
  ({
    listCalls: bound(E.listCalls, ({ caller }) =>
      calls.rows().filter((row) => visible(context, caller, row)),
    ),
    showCameraInCall: bound(E.showCameraInCall, ({ body, caller }) => {
      const callId = ownCall(context, calls, caller, body.callId);
      return refusing(() => calls.show(callId, body.cameraId));
    }),
    stopSightInCall: bound(E.stopSightInCall, ({ body, caller }) => {
      const callId = ownCall(context, calls, caller, body.callId);
      return refusing(() => calls.stop(callId));
    }),
  }) as const;
