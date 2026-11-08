import { DevSettings } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import { isNative } from '../design/platform';
import { restartViaUpdates } from '../features/app-updates';

const log = new Logger('app.developer');

export function restartApp(): void {
  if (!isNative()) {
    window.location.reload();
    return;
  }
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  background(restartViaUpdates(), 'developer.restart_failed');
  log.info('developer.restart_requested', {});
}
