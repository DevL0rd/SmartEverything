import { Platform } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { setWatchCapture } from '../../modules/health-connect/src/watches';
import { setDeveloperDevice } from '../api/developer';
import { errorFields } from '../design/log-tally';
import { readDeveloperFlags } from './flags';

const log = new Logger('app.developer');

export async function applyWatchCapture(on: boolean): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const saving = await setDeveloperDevice(on);
    await setWatchCapture(saving);
    log.info('watch_capture.applied', { wanted: on, saving });
  } catch (error) {
    log.warn('watch_capture.not_applied', { wanted: on, ...errorFields(error) });
    await stopSaving();
  }
}

async function stopSaving(): Promise<void> {
  try {
    await setWatchCapture(false);
  } catch (error) {
    log.warn('watch_capture.not_applied', { wanted: false, ...errorFields(error) });
  }
}

export async function startWatchCapture(): Promise<void> {
  if (readDeveloperFlags()['watch.capture']) {
    await applyWatchCapture(true);
    return;
  }
  if (Platform.OS === 'android') await stopSaving();
}
