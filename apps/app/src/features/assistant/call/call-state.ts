import {
  SIGHT_LOOKS_KEPT,
  type CallCapabilities,
  type CallEnding,
  type CallState,
  type EchoTestOutcome,
  type SightFacing,
  type SightLookTrigger,
  type SightSource,
} from '@smarteverything/domain';
import { ValueStore, useValue } from '../../../design/external-store';
import type { OrbState } from './orb';

export type CallPhase = 'idle' | CallState | 'reconnecting' | 'ended';

const TOOL_LINES_KEPT = 4;

export type CallFix = 'microphone';

export interface CallSightStatus {
  readonly source: SightSource;
  readonly label: string | null;
}

export interface CallLook {
  readonly lookId: string;
  readonly source: SightSource;
  readonly label: string;
  readonly at: string;
  readonly trigger: SightLookTrigger;
  readonly picture: string | null;
}

export interface CallSightRequest {
  readonly requestId: string;
  readonly what: SightSource;
  readonly why: string;
  readonly target: string | null;
}

export type CameraPhase = 'off' | 'starting' | 'on' | 'paused' | 'denied' | 'busy';

export type ScreenPhase = 'off' | 'starting' | 'on';

export interface CallVideo {
  readonly camera: CameraPhase;
  readonly facing: SightFacing;
  readonly light: boolean;
  readonly screen: ScreenPhase;
}

export type CallEchoTest =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly outcome: EchoTestOutcome };

export interface CallView {
  readonly phase: CallPhase;
  readonly callId: string | null;
  readonly chatId: string | null;
  readonly fix: CallFix | null;
  readonly startedAt: number | null;
  readonly muted: boolean;
  readonly speaking: boolean;
  readonly video: CallVideo;
  readonly sharedAtEnd: boolean;
  readonly heard: string;
  readonly said: string;
  readonly tools: readonly string[];
  readonly ending: CallEnding | null;
  readonly problem: string | null;
  readonly capabilities: CallCapabilities | null;
  readonly sight: CallSightStatus | null;
  readonly notice: string | null;
  readonly looks: readonly CallLook[];
  readonly request: CallSightRequest | null;
  readonly echoTest: CallEchoTest;
}

export const IDLE_VIDEO: CallVideo = {
  camera: 'off',
  facing: 'back',
  light: false,
  screen: 'off',
};

export const IDLE_CALL: CallView = {
  phase: 'idle',
  callId: null,
  chatId: null,
  fix: null,
  startedAt: null,
  muted: false,
  speaking: false,
  video: IDLE_VIDEO,
  sharedAtEnd: false,
  heard: '',
  said: '',
  tools: [],
  ending: null,
  problem: null,
  capabilities: null,
  sight: null,
  notice: null,
  looks: [],
  request: null,
  echoTest: { status: 'idle' },
};

export const callState = new ValueStore<CallView>(IDLE_CALL);

export function changeCall(change: (call: CallView) => Partial<CallView>): void {
  callState.update((call) => ({ ...call, ...change(call) }));
}

export function addToolLine(line: string): void {
  changeCall((call) => ({ tools: [...call.tools, line].slice(-TOOL_LINES_KEPT) }));
}

export function addLook(look: CallLook): void {
  changeCall((call) => ({ looks: [...call.looks, look].slice(-SIGHT_LOOKS_KEPT) }));
}

export interface CallEnd {
  readonly ending: CallEnding;
  readonly problem: string | null;
  readonly fix?: CallFix;
}

export function markEnded(end: CallEnd): void {
  if (callActive(callState.get())) {
    changeCall((call) => ({
      phase: 'ended',
      ending: end.ending,
      problem: end.problem,
      fix: end.fix ?? null,
      sharedAtEnd: call.sight !== null || call.video.screen === 'on',
      sight: null,
      speaking: false,
      request: null,
      video: IDLE_VIDEO,
    }));
  }
}

export function callActive(call: CallView): boolean {
  return call.phase !== 'idle' && call.phase !== 'ended';
}

export function useCall(): CallView {
  return useValue(callState);
}

export function orbStateOf(call: CallView): OrbState {
  if (call.phase === 'listening' || call.phase === 'thinking' || call.phase === 'speaking') {
    return call.phase;
  }
  return call.phase === 'connecting' ? 'thinking' : 'idle';
}

export function changeVideo(change: (video: CallVideo) => Partial<CallVideo>): void {
  changeCall((call) => ({ video: { ...call.video, ...change(call.video) } }));
}
