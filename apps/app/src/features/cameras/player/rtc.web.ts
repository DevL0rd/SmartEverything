import { notify } from '../../../components/toast-store';
export { createRelayLink, relaySupported } from './mse-relay.web';
import {
  PeerError,
  peerIceServers,
  stateOfConnection,
  type CameraPeer,
  type CaptureMode,
  type FrameCapture,
  type MediaHandle,
  type PeerOptions,
  type PeerState,
  type ScreenFill,
} from './peer-types';
import {
  audioSenderOf,
  gathered,
  microphoneFor,
  offeredSdp,
  type GatheringSource,
} from './peer-shared';

function gatheringOf(connection: RTCPeerConnection): GatheringSource {
  return {
    state: (): string => connection.iceGatheringState,
    onChange: (listener): void => {
      connection.addEventListener('icegatheringstatechange', listener);
    },
  };
}

interface Received {
  readonly onMedia: (listener: (media: MediaHandle) => void) => void;
  readonly onVideoFlow: (listener: (flowing: boolean) => void) => void;
}

function watchFlow(
  track: MediaStreamTrack,
  listeners: readonly ((flowing: boolean) => void)[],
): void {
  const tell = (flowing: boolean): void => {
    for (const listener of listeners) {
      listener(flowing);
    }
  };
  track.addEventListener('mute', () => {
    tell(false);
  });
  track.addEventListener('unmute', () => {
    tell(true);
  });
}

function receive(connection: RTCPeerConnection, remote: MediaStream): Received {
  const media: ((media: MediaHandle) => void)[] = [];
  const flow: ((flowing: boolean) => void)[] = [];
  connection.addEventListener('track', (event) => {
    remote.addTrack(event.track);
    if (event.track.kind === 'video') {
      watchFlow(event.track, flow);
    }
    for (const listener of media) {
      listener({ id: remote.id, source: remote });
    }
  });
  return {
    onMedia: (listener): void => {
      media.push(listener);
    },
    onVideoFlow: (listener): void => {
      flow.push(listener);
    },
  };
}

async function offerOf(connection: RTCPeerConnection): Promise<string> {
  await connection.setLocalDescription(await connection.createOffer());
  await gathered(gatheringOf(connection));
  return offeredSdp(connection.localDescription?.sdp);
}

async function captureMicrophone(): Promise<MediaStreamTrack | null> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return stream.getAudioTracks()[0] ?? null;
}

export function createCameraPeer(options: PeerOptions): CameraPeer {
  const connection = new RTCPeerConnection({ iceServers: peerIceServers(options.iceServers) });
  const sender = audioSenderOf(connection, options.twoWayAudio, options.video);
  const remote = new MediaStream();
  const microphone = microphoneFor({
    sender,
    twoWayAudio: options.twoWayAudio,
    capture: captureMicrophone,
  });
  const received = receive(connection, remote);
  const peer: CameraPeer = {
    offer: () => offerOf(connection),
    answer: (sdp) => connection.setRemoteDescription({ type: 'answer', sdp }),
    onMedia: received.onMedia,
    onVideoFlow: received.onVideoFlow,
    onState: (listener: (state: PeerState) => void) => {
      connection.addEventListener('connectionstatechange', () => {
        listener(stateOfConnection(connection.connectionState));
      });
    },
    setListening: (listening) => {
      for (const track of remote.getAudioTracks()) {
        track.enabled = listening;
      }
    },
    setTalking: microphone.setTalking,
    stats: async () => connection.getStats(),
    close: () => {
      microphone.stop();
      connection.close();
    },
  };
  return peer;
}

function canvasOf(stream: MediaStream): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    video.addEventListener('loadeddata', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context === null) {
        reject(new PeerError('taking a snapshot', 'the browser gave no drawing surface'));
        return;
      }
      context.drawImage(video, 0, 0);
      video.srcObject = null;
      resolve(canvas);
    });
    video.play().catch(reject);
  });
}

function blobOf(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new PeerError('taking a snapshot', 'the browser made no picture'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      0.92,
    );
  });
}

const DOWNLOAD_KEPT_MS = 60_000;

async function savePicture(blob: Blob, name: string, mode: CaptureMode): Promise<FrameCapture> {
  const file = new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  if (mode === 'share') {
    if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) {
      return {
        kind: 'unavailable',
        reason: 'This browser cannot share pictures; use Save instead',
      };
    }
    await navigator.share({ files: [file], title: name });
    return { kind: 'shared', name: file.name };
  }
  const address = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = address;
  link.download = file.name;
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(address);
  }, DOWNLOAD_KEPT_MS);
  return { kind: 'saved', name: file.name };
}

export function capturesVideoFrames(): boolean {
  return true;
}

export async function captureFrame(
  media: MediaHandle,
  name: string,
  mode: CaptureMode,
): Promise<FrameCapture> {
  if (!(media.source instanceof MediaStream)) {
    throw new PeerError('taking a snapshot', 'the video carries no peer-to-peer stream');
  }
  return savePicture(await blobOf(await canvasOf(media.source)), name, mode);
}

export async function saveServerPicture(
  url: string,
  name: string,
  mode: CaptureMode,
): Promise<FrameCapture> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new PeerError('taking a snapshot', `the server answered HTTP ${String(response.status)}`);
  }
  return savePicture(await response.blob(), name, mode);
}

export function canSharePictures(): boolean {
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
}

export function immerse(_on: boolean): Promise<void> {
  return Promise.resolve();
}

export async function fillScreen(fill: boolean): Promise<ScreenFill> {
  if (!fill) {
    if (document.fullscreenElement !== null) {
      await document.exitFullscreen();
    }
    return { kind: 'filled' };
  }
  if (!document.fullscreenEnabled) {
    return { kind: 'unavailable', reason: 'This browser does not allow full screen here' };
  }
  await document.documentElement.requestFullscreen();
  return { kind: 'filled' };
}

export function onScreenFillEnded(listener: () => void): () => void {
  const changed = (): void => {
    if (document.fullscreenElement === null) {
      listener();
    }
  };
  document.addEventListener('fullscreenchange', changed);
  return (): void => {
    document.removeEventListener('fullscreenchange', changed);
  };
}

export function pictureInPictureSupported(): boolean {
  return document.pictureInPictureEnabled;
}

export function enterPictureInPicture(media: MediaHandle | null): void {
  const video = [...document.querySelectorAll('video')].find(
    (element) => media !== null && element.srcObject === media.source,
  );
  if (video === undefined) {
    return;
  }
  video.requestPictureInPicture().catch((error: unknown) => {
    notify({ message: 'Picture in picture didn’t open', error, tone: 'critical' });
  });
}
