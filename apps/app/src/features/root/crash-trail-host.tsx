import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useSegments } from 'expo-router';
import { sendTrail } from '../../api/client-failures';
import { useConnection } from '../../api/transport';
import { markBooted } from '../../platform/crash-guard';
import { setScreen } from '../../platform/crash-trail';
import { Logger } from '@smarteverything/logging';
import { reportProcessExits } from '../../platform/last-exit';
import { useSyncStatus } from '../../store/selectors';

const log = new Logger('app.process');

const GROUP = /^\(.*\)$/;

function TrailSender(): ReactNode {
  const sync = useSyncStatus();
  useEffect(() => {
    if (sync.status === 'live') {
      void sendTrail();
    }
  }, [sync.status]);
  return null;
}

export function CrashTrailHost(): ReactNode {
  const segments = useSegments();
  const connection = useConnection();
  const screen = segments.filter((segment) => !GROUP.test(segment)).join('/');
  useEffect(() => {
    markBooted();
    reportProcessExits().catch((error: unknown) => {
      log.warn('exits.not_read', { reason: String(error) });
    });
  }, []);
  useEffect(() => {
    setScreen(screen);
  }, [screen]);
  return connection.status === 'paired' ? <TrailSender /> : null;
}
