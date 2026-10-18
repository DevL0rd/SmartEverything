import { Platform as WebPlatform } from 'react-native-web';

export * from 'react-native-web';

interface PlatformSpecifics<T> {
  readonly android?: T;
  readonly native?: T;
  readonly default?: T;
}

export const Platform = {
  ...WebPlatform,
  OS: 'android',
  Version: 35,
  constants: { Manufacturer: 'SmartEverything', Model: 'Test', Release: '15' },
  select: <T>(specifics: PlatformSpecifics<T>): T | undefined =>
    specifics.android ?? specifics.native ?? specifics.default,
} as const;
