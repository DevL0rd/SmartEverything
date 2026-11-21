import { background } from '@smarteverything/logging';
import type { Store } from '../../../store/store';
import type { ConversationLog } from '../../conversation-log';
import { recordNativeChildTask } from './children-live';
import { NativeTranscripts } from './transcript';
import { CommandLanes } from '../../../commands/lanes';
import type { SettledChild } from './children-units';

function settleChildTask(conversation: ConversationLog, { run, taskId }: SettledChild): void {
  background(
    run.state === 'failed'
      ? conversation.failedMessage(taskId, run.error ?? 'The helper ended.', 'unknown')
      : conversation.stateOf(taskId, 'answered'),
    'dsh.child_task_state_failed',
    { runId: run.id },
  );
}

export interface NativeSessionWatch {
  readonly settled: () => Promise<void>;
}

export function watchNativeSessions(
  store: Store,
  conversation: ConversationLog,
  now: () => Date,
): NativeSessionWatch {
  const transcripts = new NativeTranscripts(store, conversation);
  const lanes = new CommandLanes();
  const running = new Set<Promise<void>>();
  store.live.dshSessions.onAppend((sessionId, events, write) => {
    const at = now().toISOString();
    const track = (pending: Promise<void>, failure: string): void => {
      running.add(pending);
      background(
        pending.finally(() => {
          running.delete(pending);
        }),
        failure,
        { sessionId },
      );
    };
    const work = lanes.run(sessionId, async () => {
      const appended = await store.host.write('nativeChildAppended', {
        sessionId,
        events,
        now: at,
      });
      if (appended.task !== null)
        track(recordNativeChildTask(conversation, appended.task), 'dsh.child_task_state_failed');
      if (write === 'append') await transcripts.appended(sessionId, events);
      if (appended.settled !== null) settleChildTask(conversation, appended.settled);
    });
    track(work, 'dsh.session_append_failed');
  });
  return {
    settled: async (): Promise<void> => {
      while (running.size > 0) await Promise.allSettled([...running]);
      await transcripts.settled();
      await conversation.settled();
    },
  };
}
