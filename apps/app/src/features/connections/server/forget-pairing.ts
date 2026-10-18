import { Logger } from '@smarteverything/logging';
import { forgetServer } from '../../../api/transport';
import { rawErrorText } from '../../../format/errors';
import { forgetThisPhone } from '../../../platform/push';

const log = new Logger('app.connections');

export async function forgetPairing(): Promise<void> {
  log.info('pairing.forgetting');
  await forgetThisPhone().catch((error: unknown) => {
    log.warn('push.forget_failed', { reason: rawErrorText(error) });
  });
  await forgetServer();
  log.info('pairing.forgotten');
}
