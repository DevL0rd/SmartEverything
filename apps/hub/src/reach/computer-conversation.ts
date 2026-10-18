import type { AssistantVoiceServerMessage } from '@smarteverything/domain';
import { PLAYOUT_SLACK_MS } from '../assistant-voice/call-link';
import type { HostedCall, HostedListening, ReachOpening } from '../assistant-voice/outreach';
import type { HostedCaller } from '../assistant-voice/persona';
import type { ComputerAudio } from '../computers/computer-call-audio';
import type { OpenMicrophone } from '../talk/camera-microphone';
import { hostLine, once, type HostedLine, type HostedVoiceDeps } from './hosted-call';
import type { VoiceActivity, VoiceCallTap } from '../listening/voice-activity';
import { ReachRefusedError } from './reach-errors';
import { background } from '@smarteverything/logging';

export interface ComputerParts {
  readonly audio: ComputerAudio;
  readonly activity: Pick<VoiceActivity, 'begin'>;
}

export interface ComputerRequest {
  readonly computerId: string;
  readonly computerName: string;
  readonly caller: HostedCaller;
  readonly opening: ReachOpening;
  readonly heard?: () => Int16Array;
  readonly muteMic: boolean;
  readonly tap?: VoiceCallTap;
}

export function computerOpening(
  computerName: string,
  reason: string,
  listenFirst: boolean,
): string {
  return [
    `You are now talking through ${computerName}’s speakers and microphone to whoever is at it.`,
    `Why: ${reason}`,
    listenFirst ? 'Their words follow as audio; answer them.' : 'Speak first.',
  ].join('\n');
}

const GATED_MIC: HostedListening = { echoFree: false, playoutSlackMs: PLAYOUT_SLACK_MS.app };

type ComputerDeps = HostedVoiceDeps & { readonly computer: ComputerParts };

function listen(
  deps: ComputerDeps,
  computerId: string,
  line: HostedLine,
  tap: VoiceCallTap | undefined,
): OpenMicrophone {
  const microphone = deps.computer.audio.microphone(computerId, {
    pcm: (pcm): void => {
      tap?.heard(pcm);
      line.call.hear(pcm);
    },
    ended: (failure): void => {
      if (failure !== null) {
        deps.log.warn('reach.computer_microphone_ended', { computerId, reason: failure });
        background(line.call.end('failed'), 'call.end_failed');
      }
    },
  });
  if (microphone === null) {
    background(line.call.end('failed'), 'call.end_failed');
    throw new ReachRefusedError('That computer’s microphone is not available right now.');
  }
  return microphone;
}

function announce(tap: VoiceCallTap | undefined, message: AssistantVoiceServerMessage): void {
  if (message.type === 'call_state') {
    tap?.phase(message.state);
  } else if (message.type === 'caption') {
    tap?.caption(message.who, message.text);
  } else if (message.type === 'ended') {
    tap?.phase('ended');
  }
}

export async function computerConversation(
  deps: ComputerDeps,
  request: ComputerRequest,
): Promise<HostedCall> {
  const { computerId, opening } = request;
  const sink = deps.computer.audio.speaker(computerId);
  if (sink === null) {
    request.tap?.end();
    throw new ReachRefusedError(`${request.computerName} is not listening right now.`);
  }
  const { tap } = request;
  const microphone: { current: OpenMicrophone | null } = { current: null };
  const close = once(() => {
    sink.end();
    microphone.current?.stop();
    tap?.end();
  });
  const line = await hostLine(deps, {
    key: `computer:${computerId}`,
    deviceId: computerId,
    callId: opening.outreachId,
    caller: request.caller,
    opening,
    play: (packet): void => {
      tap?.spoke(packet);
      sink.packet(packet);
    },
    listen: (message): void => {
      announce(tap, message);
    },
    closed: close,
    ...(request.muteMic ? {} : { listening: GATED_MIC }),
    ...(request.heard === undefined ? {} : { heard: request.heard }),
  }).catch((cause: unknown) => {
    close();
    throw cause;
  });
  microphone.current = listen(deps, computerId, line, tap);
  return {
    ...line.call,
    mute: (muted): void => {
      tap?.muted(muted);
      line.call.mute(muted);
    },
  };
}
