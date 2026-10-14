import type { AiHarnessSession } from '@smarteverything/domain';
import type { HarnessRuntimeEvent } from '../host/events';

type NativeEvent = Extract<HarnessRuntimeEvent, { kind: 'session' }>;
type StatusEvent = Extract<HarnessRuntimeEvent, { kind: 'status' }>;

export function projectNativeSessionChange(
  event: NativeEvent,
  work: (id: string) => readonly AiHarnessSession['work'][number][],
  native: (event: NativeEvent) => Promise<void>,
  status: (event: StatusEvent) => Promise<void>,
): Promise<void> {
  const type = event.event.type;
  if (type !== 'command/done' && type !== 'compaction/end') return native(event);
  return status({
    kind: 'status',
    sessionId: event.sessionId,
    status: work(event.sessionId).some((entry) => entry.kind === 'turn') ? 'running' : 'idle',
  });
}
