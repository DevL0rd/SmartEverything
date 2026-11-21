import { Logger } from '@smarteverything/logging';
import { durableStoreUnit } from '../store/host/unit';
import type { HarnessSessionsRepository } from '../store/repositories/harness-sessions';

const log = new Logger('hub.harness');

function settleRestartedSessions(sessions: HarnessSessionsRepository): void {
  for (const id of sessions.switchingSessions()) {
    log.warn('harness.switch_interrupted', { harnessSession: id });
    sessions.settleSwitching(id, {
      code: 'operation_failed',
      message: 'The hub restarted during the machine change; send a message to continue.',
      retry_at: null,
    });
  }
  for (const session of sessions.serverSessionsAtWork()) {
    log.warn('harness.work_interrupted', {
      harnessSession: session.session_id,
      state: session.state,
    });
    sessions.settleStoppedWork(session.session_id);
  }
}

export const HARNESS_RESTART_SETTLE_UNIT = durableStoreUnit((store, _input: null): null => {
  settleRestartedSessions(store.harnessSessions);
  return null;
});
