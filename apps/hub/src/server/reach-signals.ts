import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { ListeningRegistry } from '../listening/listening-registry';
import type { SignalBus } from '../signals/bus';
import { callSignal } from '../signals/sources/call';
import { listeningStateSignal, wakeHeardSignal } from '../signals/sources/listening';
import type { WakeClaims } from '../wake-name/wake-claims';

export interface ReachSignalSources {
  readonly voice: Pick<AssistantVoice, 'onCall'>;
  readonly listening: Pick<ListeningRegistry, 'onStateChanged'>;
  readonly claims: Pick<WakeClaims, 'onArbitrated'>;
}

export function emitReachSignals(
  signals: Pick<SignalBus, 'emit'>,
  sources: ReachSignalSources,
  now: () => Date,
): () => void {
  const stops = [
    sources.claims.onArbitrated((arbitrated) => {
      signals.emit(wakeHeardSignal(arbitrated));
    }),
    sources.listening.onStateChanged((change) => {
      signals.emit(listeningStateSignal(change, now()));
    }),
    sources.voice.onCall((moment) => {
      signals.emit(callSignal(moment));
    }),
  ];
  return (): void => {
    stops.forEach((stop) => {
      stop();
    });
  };
}
