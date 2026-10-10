import type { IceServer } from '@smarteverything/domain';

export type PeerState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface MediaHandle {
  readonly id: string;
  readonly source: unknown;
}

export interface MediaLink {
  readonly onMedia: (listener: (media: MediaHandle) => void) => void;
  readonly onState: (listener: (state: PeerState) => void) => void;
  readonly onVideoFlow: (listener: (flowing: boolean) => void) => void;
  readonly setListening: (listening: boolean) => void;
  readonly setTalking: (talking: boolean) => Promise<void>;
  readonly stats: () => Promise<unknown>;
  readonly close: () => void;
}

export interface CameraPeer extends MediaLink {
  readonly offer: () => Promise<string>;
  readonly answer: (sdp: string) => Promise<void>;
}

export type Transport = 'webrtc' | 'mse';

export interface PeerOptions {
  readonly twoWayAudio: boolean;
  readonly video: boolean;
  readonly iceServers: readonly IceServer[];
}

export type FrameCapture =
  | { readonly kind: 'saved'; readonly name: string }
  | { readonly kind: 'shared'; readonly name: string }
  | { readonly kind: 'opened'; readonly name: string }
  | { readonly kind: 'unavailable'; readonly reason: string };

export type CaptureMode = 'download' | 'share';

export type ScreenFill =
  { readonly kind: 'filled' } | { readonly kind: 'unavailable'; readonly reason: string };

export const ICE_GATHERING_LIMIT_MS = 5000;

export const GATHERING_STEP = 'gathering network candidates';

export class PeerError extends Error {
  override readonly name = 'PeerError';

  constructor(
    readonly step: string,
    readonly reason: string,
  ) {
    super(`The camera connection failed while ${step}: ${reason}.`);
  }
}

export function stateOfConnection(state: string): PeerState {
  switch (state) {
    case 'new':
    case 'connecting':
    case 'connected':
    case 'disconnected':
    case 'failed':
    case 'closed':
      return state;
    default:
      return 'connecting';
  }
}

export interface PeerIceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export function peerIceServers(servers: readonly IceServer[]): PeerIceServer[] {
  return servers.map((server) => ({
    urls: [...server.urls],
    ...(server.username === undefined ? {} : { username: server.username }),
    ...(server.credential === undefined ? {} : { credential: server.credential }),
  }));
}
