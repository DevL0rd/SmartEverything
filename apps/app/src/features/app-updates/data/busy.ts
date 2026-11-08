import { callActive, callState } from '../../assistant';
import { cameraTalkSessions } from '../../cameras';
import { talkEngineState } from '../../talk';
import { canRestartNow, type BusyState } from '../model/update-state';

export function busyState(): BusyState {
  const talk = talkEngineState.get();
  return {
    aiCall: callActive(callState.get()),
    cameraCall: cameraTalkSessions.get() > 0,
    walkie: talk.transmit.status !== 'idle' || talk.receive !== null,
  };
}

export function busyNow(): boolean {
  return !canRestartNow(busyState());
}

export function watchBusy(listener: (busy: boolean) => void): () => void {
  let last = busyNow();
  const changed = (): void => {
    const busy = busyNow();
    if (busy === last) return;
    last = busy;
    listener(busy);
  };
  const stops = [
    callState.subscribe(changed),
    cameraTalkSessions.subscribe(changed),
    talkEngineState.subscribe(changed),
  ];
  return (): void => {
    for (const stop of stops) stop();
  };
}
