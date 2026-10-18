import { PLAYOUT_SLACK_MS } from '../assistant-voice/call-link';
import type { HostedCall, HostedListening, ReachOpening } from '../assistant-voice/outreach';
import type { HostedCaller } from '../assistant-voice/persona';
import type { CameraMicrophones, OpenMicrophone } from '../talk/camera-microphone';
import type { CameraSpeakers } from '../talk/camera-speaker';
import type { CameraVideo } from '../talk/camera-video';
import { hostLine, once, type HostedLine, type HostedVoiceDeps } from './hosted-call';
import { OpusSpeech } from './voice-pacing';
import { background } from '@smarteverything/logging';

export interface CameraParts {
  readonly speakers: CameraSpeakers;
  readonly microphones: CameraMicrophones;
  readonly video: Pick<CameraVideo, 'watch'>;
}

export interface CameraRequest {
  readonly cameraId: string;
  readonly cameraName: string;
  readonly caller: HostedCaller;
  readonly opening: ReachOpening;
  readonly heard?: () => Int16Array;
  readonly liveVideo: boolean;
  readonly muteMic: boolean;
}

const OPEN_MIC: HostedListening = { echoFree: true, playoutSlackMs: PLAYOUT_SLACK_MS.open };

type CameraDeps = HostedVoiceDeps & { readonly camera: CameraParts };

function listen(deps: CameraDeps, cameraId: string, line: HostedLine): Promise<OpenMicrophone> {
  const speech = new OpusSpeech(line.call.hear);
  return deps.camera.microphones
    .open(cameraId, {
      packet: (packet): void => {
        speech.packet(packet);
      },
      ended: (failure): void => {
        speech.free();
        if (failure !== null) {
          deps.log.warn('reach.camera_microphone_ended', { cameraId, reason: failure });
          background(line.call.end('failed'), 'call.end_failed');
        }
      },
    })
    .catch(async (cause: unknown) => {
      speech.free();
      await line.call.end('failed');
      throw cause;
    });
}

export async function cameraConversation(
  deps: CameraDeps,
  request: CameraRequest,
): Promise<HostedCall> {
  const { cameraId, opening } = request;
  const sink = deps.camera.speakers.open(cameraId, opening.outreachId, 'assistant');
  const microphone: { current: OpenMicrophone | null } = { current: null };
  const video: { stop: () => void } = { stop: (): void => undefined };
  const close = once(() => {
    sink.end();
    video.stop();
    microphone.current?.stop();
  });
  const line = await hostLine(deps, {
    key: `camera:${cameraId}`,
    deviceId: cameraId,
    callId: opening.outreachId,
    caller: request.caller,
    opening,
    play: sink.packet,
    closed: close,
    continuous: true,
    ...(request.muteMic ? {} : { listening: OPEN_MIC }),
    ...(request.heard === undefined ? {} : { heard: request.heard }),
  }).catch((cause: unknown) => {
    close();
    throw cause;
  });
  if (request.liveVideo) {
    video.stop = deps.camera.video.watch(cameraId, line.call.see);
  }
  microphone.current = await listen(deps, cameraId, line);
  return line.call;
}
