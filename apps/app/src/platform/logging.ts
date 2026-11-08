import Constants from 'expo-constants';
import { Logger } from '@smarteverything/logging';
import { isNative } from '../design/platform';
import { shipLog } from './log-ship';
import { nameUiBundle } from './ui-bundle';

function releaseOfBuild(): string {
  const version = Constants.expoConfig?.version;
  if (version === undefined) {
    throw new Error('the Expo config carries no version, so this build cannot name its release');
  }
  return version;
}

export function startLogging(): void {
  Logger.configure({
    level: 'info',
    style: __DEV__ && isNative() ? 'pretty' : __DEV__ ? 'plain' : 'json',
    consoleRouting: __DEV__ ? 'log-only' : 'warnings-only',
    context: { platform: isNative() ? 'android' : 'web', release: releaseOfBuild() },
  });
  Logger.configure({
    sink: (record): void => {
      try {
        Logger.write(record);
      } finally {
        shipLog(record);
      }
    },
  });
  void nameUiBundle();
}
