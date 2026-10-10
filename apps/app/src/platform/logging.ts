import Constants from 'expo-constants';
import { Logger } from '@smarteverything/logging';
import { isNative } from '../design/platform';
import { recordLog } from './crash-trail';

function releaseOfBuild(): string {
  const version = Constants.expoConfig?.version;
  if (version === undefined) {
    throw new Error('the Expo config carries no version, so this build cannot name its release');
  }
  return version;
}

export function startLogging(): void {
  Logger.configure({
    level: __DEV__ ? 'debug' : 'info',
    style: __DEV__ && isNative() ? 'pretty' : __DEV__ ? 'plain' : 'json',
    consoleRouting: __DEV__ ? 'log-only' : 'by-level',
    tap: recordLog,
    context: { platform: isNative() ? 'android' : 'web', release: releaseOfBuild() },
  });
}
