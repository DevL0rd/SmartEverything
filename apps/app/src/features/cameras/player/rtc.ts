import {
  MediaStream,
  MediaStreamTrack,
  RTCPeerConnection,
  mediaDevices,
} from 'react-native-webrtc';
import { BackHandler, StatusBar } from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';
import * as WebBrowser from 'expo-web-browser';
import { z } from 'zod';
import {
  PeerError,
  peerIceServers,
  stateOfConnection,
  type CameraPeer,
  type CaptureMode,
  type FrameCapture,
  type MediaHandle,
  type MediaLink,
  type PeerOptions,
  type ScreenFill,
} from './peer-types';
import {
  audioSenderOf,
  gathered,
  microphoneFor,
  offeredSdp,
  type GatheringSource,
} from './peer-shared';

interface Listenable {
  readonly addEventListener: (type: string, listener: (event: unknown) => void) => void;
}

function isListenable(target: unknown): target is Listenable {
  return (
    typeof target === 'object' &&
    target !== null &&
    typeof Reflect.get(target, 'addEventListener') === 'function'
  );
}

function listen(target: unknown, type: string, listener: (event: unknown) => void): void {
  if (!isListenable(target)) {
    throw new PeerError('listening to the connection', `it cannot report ${type}`);
  }
  target.addEventListener(type, listener);
}

function trackOf(event: unknown): MediaStreamTrack | null {
  const track: unknown =
    typeof event === 'object' && event !== null ? Reflect.get(event, 'track') : null;
  return track instanceof MediaStreamTrack ? track : null;
}

function streamOf(event: unknown): MediaStream | null {
  const streams: unknown =
    typeof event === 'object' && event !== null ? Reflect.get(event, 'streams') : null;
  const list = z.array(z.unknown()).safeParse(streams);
  const first = list.success ? list.data[0] : null;
  return first instanceof MediaStream ? first : null;
}

const DESCRIPTION = z.object({ type: z.literal('offer'), sdp: z.string().min(1) });

function gatheringOf(connection: RTCPeerConnection): GatheringSource {
  return {
    state: (): string => connection.iceGatheringState,
    onChange: (listener): void => {
      listen(connection, 'icegatheringstatechange', listener);
    },
  };
}

interface Received {
  readonly onMedia: (listener: (media: MediaHandle) => void) => void;
  readonly onVideoFlow: (listener: (flowing: boolean) => void) => void;
  readonly audio: MediaStreamTrack[];
}

function watchFlow(track: MediaStreamTrack, flow: readonly ((flowing: boolean) => void)[]): void {
  for (const [type, flowing] of [
    ['mute', false],
    ['unmute', true],
  ] satisfies [string, boolean][]) {
    listen(track, type, () => {
      for (const listener of flow) {
        listener(flowing);
      }
    });
  }
}

function receive(connection: RTCPeerConnection, listening: { on: boolean }): Received {
  const listeners: ((media: MediaHandle) => void)[] = [];
  const flow: ((flowing: boolean) => void)[] = [];
  const audio: MediaStreamTrack[] = [];
  listen(connection, 'track', (event) => {
    const stream = streamOf(event);
    const track = trackOf(event);
    if (track?.kind === 'audio') {
      track.enabled = listening.on;
      audio.push(track);
    }
    if (track?.kind === 'video') {
      watchFlow(track, flow);
    }
    if (stream !== null) {
      for (const listener of listeners) {
        listener({ id: stream.id, source: stream });
      }
    }
  });
  return {
    onMedia: (listener): void => {
      listeners.push(listener);
    },
    onVideoFlow: (listener): void => {
      flow.push(listener);
    },
    audio,
  };
}

async function offerOf(connection: RTCPeerConnection): Promise<string> {
  const offer = DESCRIPTION.parse(await connection.createOffer({}));
  await connection.setLocalDescription(offer);
  await gathered(gatheringOf(connection));
  return offeredSdp(connection.localDescription?.sdp);
}

async function captureMicrophone(): Promise<MediaStreamTrack | null> {
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
  return stream.getAudioTracks()[0] ?? null;
}

class PeerClosedError extends Error {
  override readonly name = 'PeerClosedError';

  constructor() {
    super('The camera connection was closed before the camera answered.');
  }
}

export function createCameraPeer(options: PeerOptions): CameraPeer {
  const connection = new RTCPeerConnection({ iceServers: peerIceServers(options.iceServers) });
  let closed = false;
  const sender = audioSenderOf(connection, options.twoWayAudio, options.video);
  const listening = { on: true };
  const received = receive(connection, listening);
  const microphone = microphoneFor({
    sender,
    twoWayAudio: options.twoWayAudio,
    capture: captureMicrophone,
  });
  const peer: CameraPeer = {
    onMedia: received.onMedia,
    onVideoFlow: received.onVideoFlow,
    answer: async (sdp) => {
      if (closed) {
        throw new PeerClosedError();
      }
      await connection.setRemoteDescription({ type: 'answer', sdp });
    },
    offer: () => offerOf(connection),
    onState: (listener) => {
      listen(connection, 'connectionstatechange', () => {
        listener(stateOfConnection(connection.connectionState));
      });
    },
    setListening: (on) => {
      listening.on = on;
      for (const track of received.audio) {
        track.enabled = on;
      }
    },
    setTalking: microphone.setTalking,
    stats: async (): Promise<unknown> => {
      const report: unknown = await connection.getStats();
      return report;
    },
    close: () => {
      closed = true;
      microphone.stop();
      connection.close();
    },
  };
  return peer;
}

export function capturesVideoFrames(): boolean {
  return false;
}

export function captureFrame(
  _media: MediaHandle,
  _name: string,
  _mode: CaptureMode,
): Promise<FrameCapture> {
  return Promise.reject(
    new PeerError('taking a snapshot', 'Android takes snapshots from the server, not the video'),
  );
}

export async function saveServerPicture(
  url: string,
  name: string,
  _mode: CaptureMode,
): Promise<FrameCapture> {
  await WebBrowser.openBrowserAsync(url);
  return { kind: 'opened', name };
}

export function relaySupported(): boolean {
  return false;
}

export function createRelayLink(_url: string): MediaLink {
  throw new PeerError('playing the relayed stream', 'Android has no Media Source Extensions');
}

export function canSharePictures(): boolean {
  return false;
}

export function immerse(on: boolean): Promise<void> {
  StatusBar.setHidden(on, 'fade');
  NavigationBar.setHidden(on);
  return Promise.resolve();
}

export async function fillScreen(fill: boolean): Promise<ScreenFill> {
  await immerse(fill);
  return { kind: 'filled' };
}

export function onScreenFillEnded(listener: () => void): () => void {
  const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
    listener();
    return true;
  });
  return (): void => {
    subscription.remove();
  };
}

export function pictureInPictureSupported(): boolean {
  return false;
}

export function enterPictureInPicture(_media: MediaHandle | null): void {
  throw new PeerError('opening picture in picture', 'Android shows the camera in the app only');
}
