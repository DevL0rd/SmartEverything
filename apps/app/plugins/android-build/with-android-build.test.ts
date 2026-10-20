import { describe, expect, it } from 'vitest';
import {
  AndroidBuildPluginError,
  GRADLE_JVM_ARGS,
  linkModulesFor,
  withJvmArgs,
} from './with-android-build';

const SETTINGS = `plugins {
  id("expo-autolinking-settings")
}
expoAutolinking.useExpoModules()

rootProject.name = 'SmartEverything'
`;

const EXCLUDE =
  "expoAutolinking.exclude = ['expo-dev-client', 'expo-dev-launcher', 'expo-dev-menu', 'expo-dev-menu-interface']\n";

describe('linkModulesFor', () => {
  it('excludes the dev client modules from autolinking in the release project', () => {
    expect(linkModulesFor(SETTINGS, 'release')).toContain(
      `${EXCLUDE}expoAutolinking.useExpoModules()\n`,
    );
  });

  it('links every module in the development project', () => {
    expect(linkModulesFor(SETTINGS, 'development')).toBe(SETTINGS);
  });

  it('removes a release exclusion when the project is regenerated for development', () => {
    const release = linkModulesFor(SETTINGS, 'release');
    expect(linkModulesFor(release, 'development')).toBe(SETTINGS);
  });

  it('changes nothing on a second release run', () => {
    const once = linkModulesFor(SETTINGS, 'release');
    expect(linkModulesFor(once, 'release')).toBe(once);
  });

  it('fails loudly when the template no longer links Expo modules', () => {
    expect(() =>
      linkModulesFor(SETTINGS.replace('expoAutolinking.useExpoModules()\n', ''), 'release'),
    ).toThrow(AndroidBuildPluginError);
  });
});

describe('withJvmArgs', () => {
  it('replaces the template heap with the one the release dex merge needs', () => {
    const items = withJvmArgs([
      { type: 'comment', value: 'Project-wide Gradle settings.' },
      { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m -XX:MaxMetaspaceSize=512m' },
      { type: 'property', key: 'org.gradle.parallel', value: 'true' },
    ]);
    expect(
      items.filter((item) => item.type === 'property' && item.key === 'org.gradle.jvmargs'),
    ).toEqual([{ type: 'property', key: 'org.gradle.jvmargs', value: GRADLE_JVM_ARGS }]);
    expect(items).toHaveLength(3);
  });
});
