import {
  SIGHT_LABEL_MAX,
  type AppSightSource,
  type SightFacing,
  type SightRefusal,
} from '@smarteverything/domain';
import { rawErrorText } from '../../../../../format/errors';
import { SightStartError } from '../sight-failure';

const CAMERA_FRAME_RATE = { ideal: 5, max: 15 } as const;
const SCREEN_FRAME_RATE = { ideal: 2, max: 5 } as const;
const CAMERA_SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } } as const;

const FACING_MODES: Readonly<Record<SightFacing, string | null>> = {
  front: 'user',
  back: 'environment',
  external: null,
};

const SCREEN_LABELS = { desktop_screen: 'Computer screen', desktop_window: 'Window' } as const;

const FACING_LABELS: Readonly<Record<SightFacing, string>> = {
  front: 'Front camera',
  back: 'Back camera',
  external: 'Webcam',
};

export interface OpenedSight {
  readonly source: AppSightSource;
  readonly label: string;
  readonly facing: SightFacing | null;
  readonly stream: MediaStream;
}

export interface CameraRequest {
  readonly facing: SightFacing;
  readonly deviceId: string | null;
}

export function sightApis(): Readonly<Record<'camera' | 'screen' | 'pictures', boolean>> {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  return {
    camera: typeof devices?.getUserMedia === 'function',
    screen: typeof devices?.getDisplayMedia === 'function',
    pictures:
      typeof MediaStreamTrackProcessor === 'function' && typeof OffscreenCanvas === 'function',
  };
}

function nameOf(error: unknown): string {
  return error instanceof DOMException ? error.name : '';
}

function refusalOf(error: unknown, screen: boolean): SightRefusal {
  switch (nameOf(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return screen ? 'declined' : 'denied';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return 'failed';
  }
}

export function startFailure(source: AppSightSource, error: unknown): SightStartError {
  if (error instanceof SightStartError) {
    return error;
  }
  const screen = source !== 'phone_camera';
  return new SightStartError(source, refusalOf(error, screen), rawErrorText(error));
}

function facingOf(track: MediaStreamTrack): SightFacing {
  const mode = track.getSettings().facingMode;
  if (mode === 'user') {
    return 'front';
  }
  return mode === 'environment' ? 'back' : 'external';
}

function videoTrackOf(stream: MediaStream, source: AppSightSource): MediaStreamTrack {
  const [track] = stream.getVideoTracks();
  if (track === undefined) {
    throw new SightStartError(source, 'failed', 'The browser gave no video track');
  }
  return track;
}

export async function openCamera(request: CameraRequest): Promise<OpenedSight> {
  const mode = FACING_MODES[request.facing];
  const stream = await navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        ...CAMERA_SIZE,
        frameRate: CAMERA_FRAME_RATE,
        ...(mode === null ? {} : { facingMode: { ideal: mode } }),
        ...(request.deviceId === null ? {} : { deviceId: { exact: request.deviceId } }),
      },
    })
    .catch((error: unknown) => {
      throw startFailure('phone_camera', error);
    });
  const facing = facingOf(videoTrackOf(stream, 'phone_camera'));
  return { source: 'phone_camera', label: FACING_LABELS[facing], facing, stream };
}

function surfaceSourceOf(
  surface: string | undefined,
  wanted: 'desktop_screen' | 'desktop_window',
): 'desktop_screen' | 'desktop_window' {
  if (surface === undefined) {
    return wanted;
  }
  return surface === 'monitor' ? 'desktop_screen' : 'desktop_window';
}

export async function openScreen(
  wanted: 'desktop_screen' | 'desktop_window',
): Promise<OpenedSight> {
  const stream = await navigator.mediaDevices
    .getDisplayMedia({
      audio: false,
      video: {
        displaySurface: wanted === 'desktop_window' ? 'window' : 'monitor',
        frameRate: SCREEN_FRAME_RATE,
      },
    })
    .catch((error: unknown) => {
      throw startFailure(wanted, error);
    });
  const track = videoTrackOf(stream, wanted);
  const source = surfaceSourceOf(track.getSettings().displaySurface, wanted);
  const title = track.label.trim().slice(0, SIGHT_LABEL_MAX);
  const label = source === 'desktop_screen' || title === '' ? SCREEN_LABELS[source] : title;
  return { source, label, facing: null, stream };
}

export function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}
