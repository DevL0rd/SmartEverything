import {
  LIVE_WIRE_CHANGE,
  liveFrameOf,
  type LiveChange,
  type LiveWireChange,
} from '@smarteverything/domain';

export function wired(changes: readonly LiveChange[]): LiveWireChange[] {
  return changes.map((change) =>
    LIVE_WIRE_CHANGE.parse({ ...liveFrameOf(change), seq: change.seq }),
  );
}
