import {
  REACH_ENDPOINTS as R,
  type AiHarnessTarget,
  voiceLevelOf,
  type CallPhase,
  type VoiceActivityNotice,
  type VoiceCaptionNotice,
  type VoiceCallsNotice,
  type VoiceLevelsNotice,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { ValueStore } from '../../../design/external-store';
import { liveVoiceWatch } from '../../../store/live-voice-watch';
import type { CallLevelListener } from '../call/engine/call-engine';

export interface HostedVoice {
  readonly callId: string;
  readonly phase: CallPhase;
  readonly muted: boolean;
  readonly heard: string;
  readonly said: string;
  readonly tool: string | null;
  readonly startedAt: number;
  readonly endedAt: number | null;
}

export const hostedVoice = new ValueStore<HostedVoice | null>(null);

let ownComputer: string | null = null;
const computerCalls = new Map<string, VoiceActivityNotice>();
const listeners = new Set<CallLevelListener>();

export function ownComputerOf(target: AiHarnessTarget | null): string | null {
  return target?.kind === 'device' ? target.device_id : null;
}

export function setOwnComputer(deviceId: string | null): void {
  ownComputer = deviceId;
  const known = deviceId === null ? undefined : computerCalls.get(deviceId);
  if (known !== undefined && known.phase !== 'ended') {
    applyActivity(known);
  }
}

function applyActivity(notice: VoiceActivityNotice): void {
  const known = hostedVoice.get();
  if (
    known?.callId === notice.call_id &&
    known.phase === notice.phase &&
    known.muted === notice.muted
  ) {
    return;
  }
  hostedVoice.set(hostedOf(notice, known?.callId === notice.call_id ? known : null));
}

function hostedOf(notice: VoiceActivityNotice, same: HostedVoice | null): HostedVoice {
  return {
    callId: notice.call_id,
    phase: notice.phase,
    muted: notice.muted,
    heard: same?.heard ?? '',
    said: same?.said ?? '',
    tool: same?.tool ?? null,
    startedAt: same?.startedAt ?? notice.at,
    endedAt: notice.phase === 'ended' ? notice.at : null,
  };
}

export function receiveVoiceActivity(notice: VoiceActivityNotice): void {
  if (notice.device.kind !== 'computer') {
    return;
  }
  computerCalls.set(notice.device.id, notice);
  liveVoiceWatch.refresh(notice.call_id);
  if (notice.device.id === ownComputer) {
    applyActivity(notice);
  }
}

export function receiveVoiceCalls(snapshot: VoiceCallsNotice): void {
  computerCalls.clear();
  snapshot.calls.forEach(receiveVoiceActivity);
  const known = hostedVoice.get();
  if (known !== null && !snapshot.calls.some((call) => call.call_id === known.callId)) {
    hostedVoice.set(null);
  }
}

export function receiveVoiceLevels(notice: VoiceLevelsNotice): void {
  if (hostedVoice.get()?.callId !== notice.call_id) {
    return;
  }
  const levels = { in: voiceLevelOf(notice.in), out: voiceLevelOf(notice.out) };
  listeners.forEach((listener) => {
    listener(levels);
  });
}

export function receiveVoiceCaption(notice: VoiceCaptionNotice): void {
  const known = hostedVoice.get();
  if (known?.callId !== notice.call_id) {
    return;
  }
  hostedVoice.set(
    notice.who === 'person'
      ? { ...known, heard: notice.text }
      : notice.who === 'assistant'
        ? { ...known, said: notice.text }
        : { ...known, tool: notice.text },
  );
}

export function onHostedLevels(listener: CallLevelListener): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

export function hostedActive(hosted: HostedVoice | null): hosted is HostedVoice {
  return hosted !== null && hosted.phase !== 'ended';
}

export function watchHostedLevels(callId: string | null): void {
  liveVoiceWatch.watch(callId);
}

export function endHostedCall(callId: string): void {
  background(
    api().call(R.endOutreach, { params: { outreachId: callId } }),
    'overlay.hosted_end_failed',
  );
}

export function muteHostedCall(callId: string, muted: boolean): void {
  background(
    api().call(R.muteOutreach, { params: { outreachId: callId }, body: { muted } }),
    'overlay.hosted_mute_failed',
  );
}
