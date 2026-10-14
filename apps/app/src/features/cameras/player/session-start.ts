import { ApiError, type IceServer } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { answerCameraOffer, cameraRelayUrl } from '../../../api/media';
import { ServerUnreachableError } from '../../../api/transport';
import type { ApiClient } from '../../../api/connection/client';
import {
  GATHERING_STEP,
  PeerError,
  type MediaHandle,
  type MediaLink,
  type PeerState,
  type Transport,
} from './peer-types';
import type { SessionError, SessionPhase } from './player-state';
import { createCameraPeer, createRelayLink, relaySupported } from './rtc';
import { rawErrorText } from '../../../format/errors';

const log = new Logger('app.camera-session');

export interface SessionTarget {
  readonly client: ApiClient;
  readonly deviceId: string;
  readonly iceServers: readonly IceServer[];
}

export interface SessionHooks {
  readonly active: () => boolean;
  readonly report: (phase: SessionPhase) => void;
  readonly onMedia: (media: MediaHandle) => void;
  readonly onFlow: (flowing: boolean) => void;
  readonly onLink: (link: MediaLink, transport: Transport) => void;
}

function errorOf(error: unknown): SessionError {
  if (error instanceof ApiError) {
    return { kind: 'api', code: error.code, message: error.message };
  }
  if (error instanceof ServerUnreachableError) {
    return { kind: 'serverUnreachable', message: error.message };
  }
  if (error instanceof PeerError) {
    return error.step === GATHERING_STEP
      ? { kind: 'gathering', message: error.message }
      : { kind: 'other', message: error.message };
  }
  return { kind: 'other', message: rawErrorText(error) };
}

function phaseOfPeer(state: PeerState): SessionPhase | null {
  switch (state) {
    case 'connected':
      return { kind: 'connected' };
    case 'disconnected':
      return { kind: 'interrupted' };
    case 'failed':
      return { kind: 'failed', error: { kind: 'noPath' } };
    case 'closed':
      return { kind: 'failed', error: { kind: 'dropped' } };
    case 'new':
    case 'connecting':
      return null;
  }
}

function wire(link: MediaLink, transport: Transport, hooks: SessionHooks): void {
  hooks.onLink(link, transport);
  link.onMedia(hooks.onMedia);
  link.onVideoFlow(hooks.onFlow);
  link.onState((state) => {
    const phase = phaseOfPeer(state);
    if (phase !== null) {
      hooks.report(phase);
    }
  });
}

function failed(hooks: SessionHooks, _deviceId: string, error: unknown): void {
  hooks.report({ kind: 'failed', error: errorOf(error) });
}

export function logFailure(deviceId: string, error: SessionError): void {
  log.warn('camera.session_failed', {
    deviceId,
    reason: error.kind,
    code: error.kind === 'api' ? error.code : null,
    detail: 'message' in error ? error.message : null,
  });
}

export function startDirect(target: SessionTarget, hooks: SessionHooks): void {
  const peer = createCameraPeer({
    twoWayAudio: false,
    video: true,
    iceServers: target.iceServers,
  });
  wire(peer, 'webrtc', hooks);
  hooks.report({ kind: 'reaching' });
  peer
    .offer()
    .then((offer) =>
      hooks.active() ? answerCameraOffer(target.deviceId, offer, target.client) : null,
    )
    .then(async (answer) => {
      if (answer !== null && hooks.active()) {
        hooks.report({ kind: 'starting' });
        await peer.answer(answer);
      }
    })
    .catch((error: unknown) => {
      failed(hooks, target.deviceId, error);
    });
}

export function startRelay(target: SessionTarget, hooks: SessionHooks): void {
  if (!relaySupported()) {
    hooks.report({ kind: 'failed', error: { kind: 'relayUnsupported' } });
    return;
  }
  hooks.report({ kind: 'reaching' });
  cameraRelayUrl(target.deviceId, target.client)
    .then((url) => {
      if (!hooks.active()) {
        return;
      }
      log.info('camera.relay_started', { deviceId: target.deviceId });
      wire(createRelayLink(url), 'mse', hooks);
      hooks.report({ kind: 'starting' });
    })
    .catch((error: unknown) => {
      failed(hooks, target.deviceId, error);
    });
}

export function guarded(hooks: SessionHooks, stopped: () => boolean): SessionHooks {
  return {
    active: (): boolean => !stopped() && hooks.active(),
    report: (phase): void => {
      if (!stopped()) {
        hooks.report(phase);
      }
    },
    onMedia: (media): void => {
      if (!stopped()) {
        hooks.onMedia(media);
      }
    },
    onFlow: (flowing): void => {
      if (!stopped()) {
        hooks.onFlow(flowing);
      }
    },
    onLink: (link, transport): void => {
      if (stopped()) {
        link.close();
        return;
      }
      hooks.onLink(link, transport);
    },
  };
}
