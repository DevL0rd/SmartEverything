import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { APP_MANIFEST, declaredVersion, readRepositoryJson } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const PACKAGE = 'node_modules/react-native-reanimated';
const SYNCHRONOUS_UI_PROPS = 'ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS';
const FLAGS = z.record(z.string(), z.boolean());
const COMPATIBILITY = z.looseObject({
  fabric: z.record(
    z.string(),
    z.object({
      'react-native': z.array(z.string()),
      'react-native-worklets': z.array(z.string()).optional(),
    }),
  ),
});

function appFlags(): z.infer<typeof FLAGS> {
  return readRepositoryJson(
    APP_MANIFEST,
    z.object({ reanimated: z.object({ staticFeatureFlags: FLAGS }) }),
  ).reanimated.staticFeatureFlags;
}

function packageFile(relativePath: string): string {
  return readFileSync(repositoryFile(`${PACKAGE}/${relativePath}`), 'utf8');
}

function minorSeries(version: string): string {
  const [major = '', minor = ''] = version.split('.');
  return `${major}.${minor}.x`;
}

describe('react-native-reanimated contract', () => {
  it('is installed at exactly the version the app declares', () => {
    expect(installedVersion('react-native-reanimated')).toBe(
      declaredVersion(APP_MANIFEST, 'react-native-reanimated'),
    );
  });

  it('is paired with a worklets release and a React Native release its compatibility table lists', () => {
    const entry = readRepositoryJson(`${PACKAGE}/compatibility.json`, COMPATIBILITY).fabric[
      minorSeries(installedVersion('react-native-reanimated'))
    ];
    const worklets = installedVersion('react-native-worklets');
    const reactNative = installedVersion('react-native');
    expect(entry?.['react-native-worklets']?.map((series) => series.replace('.x', ''))).toContain(
      worklets.split('.').slice(0, 2).join('.'),
    );
    expect(entry?.['react-native'].some((series) => reactNative.startsWith(`${series}.`))).toBe(
      true,
    );
  });

  it('declares the same worklets version the app does', () => {
    expect(installedVersion('react-native-worklets')).toBe(
      declaredVersion(APP_MANIFEST, 'react-native-worklets'),
    );
  });

  it('defines every static flag the app sets, so none is silently ignored', () => {
    const known = readRepositoryJson(`${PACKAGE}/src/featureFlags/staticFlags.json`, FLAGS);
    expect(Object.keys(appFlags()).filter((name) => !(name in known))).toStrictEqual([]);
  });

  it('applies looping opacity, transform and colour frames to Android views without a commit', () => {
    expect(appFlags()[SYNCHRONOUS_UI_PROPS]).toBe(true);
    const names = packageFile('Common/cpp/reanimated/Fabric/updates/SynchronousPropNames.h');
    for (const prop of ['"opacity"', '"transform"', '"backgroundColor"']) {
      expect(names).toContain(prop);
    }
  });

  it('reads the synchronous props through the React Native accumulated-updates flag the app enables', () => {
    const proxy = packageFile('Common/cpp/reanimated/NativeModules/ReanimatedModuleProxy.cpp');
    expect(proxy).toContain('enableAccumulatedUpdatesInRawPropsAndroid()');
    const flags = readFileSync(
      repositoryFile(
        'node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/internal/featureflags/ReactNativeFeatureFlagsProvider.kt',
      ),
      'utf8',
    );
    expect(flags).toContain('fun enableAccumulatedUpdatesInRawPropsAndroid(): Boolean');
  });

  it('keeps shared element transitions off, which the synchronous path cannot run with', () => {
    expect(appFlags()['ENABLE_SHARED_ELEMENT_TRANSITIONS']).not.toBe(true);
  });

  it('reads the flags from the app manifest next to the android folder at native build time', () => {
    const gradle = packageFile('android/build.gradle.kts');
    expect(gradle).toContain('file("${rootDir.path}/../package.json")');
    expect(gradle).toContain('"staticFeatureFlags"');
  });
});
