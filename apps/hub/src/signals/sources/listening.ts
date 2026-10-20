import {
  listeningKeyOf,
  listeningSignalValue,
  type SignalInput,
  type WakeArbitrated,
} from '@smarteverything/domain';
import type { ListeningStateChange } from '../../listening/listening-registry';

function tenth(dbfs: number): number {
  return Math.round(dbfs * 10) / 10;
}

export function wakeHeardSignal(arbitrated: WakeArbitrated): SignalInput {
  const { winner, decidedBy, claims } = arbitrated;
  const loudness = tenth(winner.snippetDbfs);
  const key = listeningKeyOf(winner.source, winner.key);
  return {
    source: 'listening',
    kind: 'wake_heard',
    subject: key,
    field: null,
    value: loudness,
    previous: null,
    at: arbitrated.at,
    profileId: null,
    data: {
      source: winner.source,
      winner: key,
      decidedBy,
      loudness,
      contenders: claims.length,
    },
  };
}

export function listeningStateSignal(change: ListeningStateChange, at: Date): SignalInput {
  const { source, state, previous } = change;
  return {
    source: 'listening',
    kind: 'state',
    subject: source.key,
    field: null,
    value: listeningSignalValue(state),
    previous: previous === null ? null : listeningSignalValue(previous),
    at: at.toISOString(),
    profileId: source.profileId,
    data: { state: state.state, source: source.kind, reason: state.reason, name: source.name },
  };
}
