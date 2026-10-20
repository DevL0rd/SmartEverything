import { Logger } from '@smarteverything/logging';
import { cameraRelayUrl } from '../../../api/media';
import { createRelayLink, relaySupported } from './mse-relay.web';
import type { RelayStarter } from './relay';
import { failed, wire } from './session-start';

const log = new Logger('app.camera-session');

const startRelay: RelayStarter = (target, hooks) => {
  hooks.report({ kind: 'reaching' });
  cameraRelayUrl(target.deviceId, target.client)
    .then((url) => {
      if (!hooks.active()) {
        log.debug('camera.relay_skipped', { deviceId: target.deviceId, reason: 'inactive' });
        return;
      }
      log.info('camera.relay_started', { deviceId: target.deviceId });
      wire(createRelayLink(url), 'mse', hooks);
      hooks.report({ kind: 'starting' });
    })
    .catch((error: unknown) => {
      failed(hooks, target.deviceId, error);
    });
};

export function relayStarter(): RelayStarter | null {
  return relaySupported() ? startRelay : null;
}
