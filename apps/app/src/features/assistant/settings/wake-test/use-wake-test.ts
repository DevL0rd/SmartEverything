import { useEffect, useState } from 'react';
import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../../api/transport';
import { useScreenLive } from '../../../../design/animation-gate';
import { clearWakeTestLines } from './wake-test-lines';

const log = new Logger('app.listening');

function watch(on: boolean): void {
  api()
    .call(E.watchWakeTest, { body: { on } })
    .catch((error: unknown) => {
      log.warn('listening.wake_test_watch_failed', { on, reason: String(error) });
    });
}

export function useWakeTest(): { readonly on: boolean; readonly toggle: () => void } {
  const [wanted, setWanted] = useState(false);
  const { focused, foreground } = useScreenLive();
  const on = wanted && focused && foreground;
  useEffect(() => {
    if (!on) return undefined;
    watch(true);
    return (): void => {
      watch(false);
    };
  }, [on]);
  useEffect(() => {
    if (!wanted) clearWakeTestLines();
  }, [wanted]);
  return {
    on: wanted,
    toggle: (): void => {
      setWanted((current) => !current);
    },
  };
}
