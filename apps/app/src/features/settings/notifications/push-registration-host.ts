import { useEffect } from 'react';
import { Logger } from '@smarteverything/logging';
import { registerForPush } from '../../../platform/push';
import { rawErrorText } from '../../../format/errors';
import { usePairedServer } from '../../profiles';

const log = new Logger('app.push');

export function PushRegistrationHost(): null {
  const paired = usePairedServer();
  const url = paired?.url ?? null;
  const token = paired?.token ?? null;
  useEffect(() => {
    if (url === null || token === null) {
      return undefined;
    }
    registerForPush().catch((error: unknown) => {
      log.warn('push.auto_register_failed', { reason: rawErrorText(error) });
    });
    return undefined;
  }, [url, token]);
  return null;
}
