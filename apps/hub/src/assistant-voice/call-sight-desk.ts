import type { AssistantVoiceClientMessage, CallRow } from '@smarteverything/domain';
import type { Call } from './call-parts';
import type { CallSight } from './call-sight';
import { SightError } from './sight-error';
import { NoSuchCallError } from './video';

export type SightMessage = Extract<
  AssistantVoiceClientMessage,
  {
    type:
      | 'sight_settings'
      | 'sight_start'
      | 'sight_stop'
      | 'sight_still'
      | 'sight_unavailable'
      | 'sight_answer'
      | 'watch_camera';
  }
>;

const SIGHT_TYPES: ReadonlySet<string> = new Set<SightMessage['type']>([
  'sight_settings',
  'sight_start',
  'sight_stop',
  'sight_still',
  'sight_unavailable',
  'sight_answer',
  'watch_camera',
]);

export function isSightMessage(message: AssistantVoiceClientMessage): message is SightMessage {
  return SIGHT_TYPES.has(message.type);
}

function watchCamera(call: Call, sight: CallSight, cameraId: string): void {
  try {
    sight.watch(cameraId);
  } catch (cause) {
    if (!(cause instanceof SightError)) {
      throw cause;
    }
    call.endpoint.send({
      type: 'sight_state',
      callId: call.id,
      source: 'home_camera',
      state: 'off',
      reason: 'error',
      detail: cause.message.slice(0, 200),
      label: null,
    });
  }
}

export function routeSight(call: Call, sight: CallSight, message: SightMessage): void {
  switch (message.type) {
    case 'sight_settings':
      sight.settings(message);
      break;
    case 'sight_start':
      sight.start(message);
      break;
    case 'sight_stop':
      sight.stop(message.source, 'stopped');
      break;
    case 'sight_still':
      sight.announce(message);
      break;
    case 'sight_unavailable':
      sight.refused(message);
      break;
    case 'sight_answer':
      sight.answered(message);
      break;
    case 'watch_camera':
      watchCamera(call, sight, message.cameraId);
      break;
  }
}

function callRowOf(call: Call): CallRow {
  const { caller } = call;
  return {
    callId: call.id,
    chatId: call.chatId,
    profileId: caller.profileId,
    clientId: caller.clientId ?? '',
    source: call.source ?? 'assistant',
    device: caller.device,
    startedAt: call.startedAt.toISOString(),
    muted: call.live.muted,
    sight: call.sight?.row ?? null,
    looks: call.sight?.looksTaken ?? 0,
  };
}

interface SeeingCall extends Call {
  readonly sight: CallSight;
}

export class SightCalls {
  constructor(private readonly calls: () => Iterable<Call>) {}

  rows(): CallRow[] {
    return [...this.calls()].filter((call) => call.sight !== null).map(callRowOf);
  }

  show(callId: string, cameraId: string): CallRow {
    const call = this.running(callId);
    call.sight.watch(cameraId);
    return callRowOf(call);
  }

  stop(callId: string): CallRow {
    const call = this.running(callId);
    call.sight.stopAny('requested');
    return callRowOf(call);
  }

  budgetReached(reason: string): void {
    for (const call of this.calls()) {
      call.sight?.budgetReached(reason);
    }
  }

  private running(callId: string): SeeingCall {
    for (const call of this.calls()) {
      if (call.id === callId && call.sight !== null) {
        return { ...call, sight: call.sight };
      }
    }
    throw new NoSuchCallError(callId);
  }
}
