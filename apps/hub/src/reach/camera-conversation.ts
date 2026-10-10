import type { HostedCall, Opening } from '../assistant-voice/outreach';
import type { HostedCaller } from '../assistant-voice/persona';
import type { CameraMicrophones, OpenMicrophone } from '../talk/camera-microphone';
import type { CameraSpeakers } from '../talk/camera-speaker';
import type { CameraVideo } from '../talk/camera-video';
import { hostLine, once, type HostedLine, type HostedVoiceDeps } from './hosted-call';
import { ReachRefusedError } from './reach-errors';
import { OpusSpeech } from './voice-pacing';

export interface CameraParts {
  readonly speakers: CameraSpeakers;
  readonly microphones: CameraMicrophones;
  readonly video: Pick<CameraVideo, 'watch'>;
}

export interface CameraRequest {
  readonly cameraId: string;
  readonly cameraName: string;
  readonly caller: HostedCaller;
  readonly opening: Opening;
  readonly heard?: () => Int16Array;
  readonly liveVideo: boolean;
}

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
          void line.call.end('failed');
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
  if (sink === null) {
    throw new ReachRefusedError(`${request.cameraName}’s speaker is in use right now.`);
  }
  const microphone: { current: OpenMicrophone | null } = { current: null };
  const video: { stop: () => void } = { stop: (): void => undefined };
  const close = once(() => {
    sink.end();
    video.stop();
    microphone.current?.stop();
  });
  const line = await hostLine(deps, {
    key: `camera:${cameraId}`,
    caller: request.caller,
    opening,
    play: sink.packet,
    closed: close,
    continuous: true,
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
