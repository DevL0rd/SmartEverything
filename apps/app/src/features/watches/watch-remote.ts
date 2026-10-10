import { useEffect } from 'react';
import { Logger } from '@smarteverything/logging';
import type { WatchActionNotice, WatchActionResult } from '@smarteverything/domain';
import { isHealthConnectLinked, runWatchActionHere } from '../../../modules/health-connect';
import { answerWatchAction } from '../../api/watches';
import { rawErrorText } from '../../format/errors';
import { onWatchActionRequest } from '../../store/watch-action-requests';

const log = new Logger('app.watch');

async function carryOut(notice: WatchActionNotice): Promise<WatchActionResult> {
  try {
    return await runWatchActionHere(notice.deviceId, notice.action);
  } catch (error) {
    return { ok: false, detail: rawErrorText(error).slice(0, 400) };
  }
}

async function answer(notice: WatchActionNotice): Promise<void> {
  const result = await carryOut(notice);
  log.info('watch.remote_action_done', {
    action: notice.action.type,
    ok: result.ok,
    detail: result.detail,
  });
  try {
    await answerWatchAction(notice.requestId, result);
  } catch (error) {
    log.warn('watch.remote_action_unanswered', { reason: rawErrorText(error) });
  }
}

export function useWatchRemote(): void {
  useEffect(() => {
    if (!isHealthConnectLinked) {
      return undefined;
    }
    return onWatchActionRequest((notice) => {
      void answer(notice);
    });
  }, []);
}
