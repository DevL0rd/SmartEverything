import { Logger } from '@smarteverything/logging';
import {
  PeerError,
  peerIceServers,
  stateOfConnection,
  type CameraPeer,
  type MediaHandle,
  type PeerOptions,
} from './peer-types';
import { audioSenderOf, gathered, microphoneFor, offeredSdp } from './peer-shared';

const log = new Logger('app.camera-peer');

export type StreamOf = (event: RTCTrackEvent) => { readonly id: string } | null;

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
    track.addEventListener(type, () => {
      log.debug('peer.track_flow_changed', { type, flowing });
      for (const listener of flow) {
        listener(flowing);
      }
    });
  }
}

function receive(
  connection: RTCPeerConnection,
  streamOf: StreamOf,
  listening: { on: boolean },
): Received {
  const listeners: ((media: MediaHandle) => void)[] = [];
  const flow: ((flowing: boolean) => void)[] = [];
  const audio: MediaStreamTrack[] = [];
  connection.addEventListener('track', (event) => {
    const { track } = event;
    log.debug('peer.track_received', { kind: track.kind, muted: track.muted });
    if (track.kind === 'audio') {
      track.enabled = listening.on;
      audio.push(track);
    }
    if (track.kind === 'video') {
      watchFlow(track, flow);
    }
    const stream = streamOf(event);
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
  const startedAt = Date.now();
  await connection.setLocalDescription(await connection.createOffer());
  log.debug('peer.offer_created', () => ({ elapsedMs: Date.now() - startedAt }));
  await gathered({
    state: (): string => connection.iceGatheringState,
    onChange: (listener): void => {
      connection.addEventListener('icegatheringstatechange', listener);
    },
  });
  log.debug('peer.gathered', () => ({
    elapsedMs: Date.now() - startedAt,
    gathering: connection.iceGatheringState,
  }));
  return offeredSdp(connection.localDescription?.sdp);
}

async function captureMicrophone(): Promise<MediaStreamTrack | null> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return stream.getAudioTracks()[0] ?? null;
}

function traceConnection(connection: RTCPeerConnection, options: PeerOptions): void {
  connection.addEventListener('iceconnectionstatechange', () => {
    log.debug('peer.ice_state_changed', { state: connection.iceConnectionState });
  });
  connection.addEventListener('connectionstatechange', () => {
    log.info('peer.state_changed', {
      state: connection.connectionState,
      ice: connection.iceConnectionState,
    });
  });
  connection.addEventListener('signalingstatechange', () => {
    log.trace('peer.signaling_state_changed', { state: connection.signalingState });
  });
  log.debug('peer.created', {
    iceServers: options.iceServers.length,
    twoWayAudio: options.twoWayAudio,
    video: options.video,
  });
}

export function createPeer(options: PeerOptions, streamOf: StreamOf): CameraPeer {
  const connection = new RTCPeerConnection({ iceServers: peerIceServers(options.iceServers) });
  let closed = false;
  traceConnection(connection, options);
  const sender = audioSenderOf(connection, options.twoWayAudio, options.video);
  const listening = { on: false };
  const received = receive(connection, streamOf, listening);
  const microphone = microphoneFor({
    sender,
    twoWayAudio: options.twoWayAudio,
    capture: captureMicrophone,
  });
  const peer: CameraPeer = {
    onMedia: received.onMedia,
    onVideoFlow: received.onVideoFlow,
    offer: () => offerOf(connection),
    answer: async (sdp) => {
      if (closed) {
        throw new PeerError('answering', 'the connection was closed before the camera answered');
      }
      await connection.setRemoteDescription({ type: 'answer', sdp });
    },
    onState: (listener) => {
      connection.addEventListener('connectionstatechange', () => {
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
    stats: () => connection.getStats(),
    close: () => {
      log.debug('peer.closed', { alreadyClosed: closed });
      closed = true;
      microphone.stop();
      connection.close();
    },
  };
  return peer;
}
