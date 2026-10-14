import { GATHERING_STEP, ICE_GATHERING_LIMIT_MS, PeerError } from './peer-types';

export interface GatheringSource {
  readonly state: () => string;
  readonly onChange: (listener: () => void) => void;
}

export function gathered(source: GatheringSource): Promise<void> {
  return new Promise((resolve, reject) => {
    if (source.state() === 'complete') {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      reject(
        new PeerError(GATHERING_STEP, `none finished within ${String(ICE_GATHERING_LIMIT_MS)} ms`),
      );
    }, ICE_GATHERING_LIMIT_MS);
    source.onChange(() => {
      if (source.state() === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

export interface TalkTrack {
  enabled: boolean;
  readonly stop: () => void;
}

export interface Microphone {
  readonly setTalking: (talking: boolean) => Promise<void>;
  readonly stop: () => void;
}

export interface MicrophoneOptions<T extends TalkTrack> {
  readonly sender: { readonly replaceTrack: (track: T | null) => Promise<void> };
  readonly twoWayAudio: boolean;
  readonly capture: () => Promise<T | null>;
}

export function microphoneFor<T extends TalkTrack>({
  sender,
  twoWayAudio,
  capture,
}: MicrophoneOptions<T>): Microphone {
  let track: T | null = null;
  let stopped = false;
  const closed = (): boolean => stopped;
  return {
    setTalking: async (talking): Promise<void> => {
      if (!twoWayAudio) {
        throw new PeerError('starting talk', 'this camera has no speaker');
      }
      if (closed()) {
        return;
      }
      if (talking && track === null) {
        track = await capture();
      }
      if (closed()) {
        track?.stop();
        return;
      }
      if (track !== null) {
        track.enabled = talking;
        await sender.replaceTrack(talking ? track : null);
      }
    },
    stop: (): void => {
      stopped = true;
      track?.stop();
    },
  };
}

export function offeredSdp(sdp: string | undefined): string {
  if (sdp === undefined) {
    throw new PeerError('making the offer', 'WebRTC produced no session description');
  }
  return sdp;
}

export interface Transceivers<S> {
  addTransceiver(
    kind: 'video' | 'audio',
    init: { direction: 'recvonly' | 'sendrecv' },
  ): { readonly sender: S };
}

export function audioSenderOf<S>(
  connection: Transceivers<S>,
  twoWayAudio: boolean,
  video: boolean,
): S {
  if (video) {
    connection.addTransceiver('video', { direction: 'recvonly' });
  }
  return connection.addTransceiver('audio', { direction: twoWayAudio ? 'sendrecv' : 'recvonly' })
    .sender;
}
