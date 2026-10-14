import type { ApiErrorCode, CameraReach } from '@smarteverything/domain';

export type ConnectStep = 'reaching' | 'starting' | 'reconnecting';

export type FailureReason =
  | 'unreachable'
  | 'server'
  | 'dropped'
  | 'relayUnsupported'
  | 'noStream'
  | 'busy'
  | 'network'
  | 'unknown';

export type PlayerState =
  | { readonly kind: 'connecting'; readonly step: ConnectStep }
  | { readonly kind: 'live' }
  | { readonly kind: 'noVideo' }
  | { readonly kind: 'offline'; readonly lastSeen: string | null }
  | { readonly kind: 'privacy' }
  | { readonly kind: 'blockedByFirewall' }
  | { readonly kind: 'failed'; readonly reason: FailureReason; readonly detail: string };

export type SessionError =
  | { readonly kind: 'api'; readonly code: ApiErrorCode; readonly message: string }
  | { readonly kind: 'serverUnreachable'; readonly message: string }
  | { readonly kind: 'noPath' }
  | { readonly kind: 'gathering'; readonly message: string }
  | { readonly kind: 'dropped' }
  | { readonly kind: 'relayUnsupported' }
  | { readonly kind: 'other'; readonly message: string };

export type SessionPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reaching' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'connected' }
  | { readonly kind: 'interrupted' }
  | { readonly kind: 'failed'; readonly error: SessionError };

export type VideoFlow = 'waiting' | 'flowing' | 'stalled';

export interface CameraCondition {
  readonly online: boolean;
  readonly lastSeen: string | null;
  readonly privacy: boolean;
  readonly reach: CameraReach['state'] | null;
}

export interface PlayerInputs extends CameraCondition {
  readonly streamable: boolean;
  readonly phase: SessionPhase;
  readonly video: VideoFlow;
}

export const NO_VIDEO_AFTER_MS = 5000;

export function blockingStateOf(condition: CameraCondition): PlayerState | null {
  if (!condition.online) {
    return { kind: 'offline', lastSeen: condition.lastSeen };
  }
  if (condition.privacy) {
    return { kind: 'privacy' };
  }
  return condition.reach === 'blocked' ? { kind: 'blockedByFirewall' } : null;
}

const API_FAILURES: Partial<Readonly<Record<ApiErrorCode, FailureReason>>> = {
  camera_unavailable: 'unreachable',
  upstream_failed: 'unreachable',
  internal: 'server',
  camera_busy: 'busy',
};

function apiStateOf(code: ApiErrorCode, message: string, condition: CameraCondition): PlayerState {
  if (code === 'camera_offline') {
    return { kind: 'offline', lastSeen: condition.lastSeen };
  }
  if (code === 'camera_privacy_on') {
    return { kind: 'privacy' };
  }
  if (code === 'firewall_blocked') {
    return { kind: 'blockedByFirewall' };
  }
  return { kind: 'failed', reason: API_FAILURES[code] ?? 'unknown', detail: message };
}

function failedStateOf(error: SessionError, inputs: PlayerInputs): PlayerState {
  switch (error.kind) {
    case 'api':
      return apiStateOf(error.code, error.message, inputs);
    case 'serverUnreachable':
      return { kind: 'failed', reason: 'server', detail: error.message };
    case 'noPath':
      return { kind: 'failed', reason: 'network', detail: '' };
    case 'dropped':
      return { kind: 'failed', reason: 'dropped', detail: '' };
    case 'gathering':
      return { kind: 'failed', reason: 'network', detail: error.message };
    case 'relayUnsupported':
      return { kind: 'failed', reason: 'relayUnsupported', detail: '' };
    case 'other':
      return { kind: 'failed', reason: 'unknown', detail: error.message };
  }
}

function connectedStateOf(video: VideoFlow): PlayerState {
  switch (video) {
    case 'flowing':
      return { kind: 'live' };
    case 'stalled':
      return { kind: 'noVideo' };
    case 'waiting':
      return { kind: 'connecting', step: 'starting' };
  }
}

export function playerStateOf(inputs: PlayerInputs): PlayerState {
  const blocked = blockingStateOf(inputs);
  if (blocked !== null) {
    return blocked;
  }
  if (!inputs.streamable) {
    return { kind: 'failed', reason: 'noStream', detail: '' };
  }
  const { phase } = inputs;
  switch (phase.kind) {
    case 'idle':
    case 'reaching':
      return { kind: 'connecting', step: 'reaching' };
    case 'starting':
      return { kind: 'connecting', step: 'starting' };
    case 'interrupted':
      return { kind: 'connecting', step: 'reconnecting' };
    case 'connected':
      return connectedStateOf(inputs.video);
    case 'failed':
      return failedStateOf(phase.error, inputs);
  }
}
