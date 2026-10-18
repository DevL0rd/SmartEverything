import { describe, expect, it } from 'vitest';
import {
  RELEASE_SIGNING_PROPERTIES,
  ReleaseSigningPluginError,
  signReleaseWithOwnKey,
} from './with-release-signing';

const BUILD_GRADLE = `apply plugin: "com.android.application"

def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()

android {
    ndkVersion rootProject.ext.ndkVersion
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            signingConfig signingConfigs.debug
            minifyEnabled enableMinifyInReleaseBuilds
        }
    }
}

apply plugin: 'com.google.gms.google-services'`;

describe('signReleaseWithOwnKey', () => {
  it('signs the release build type with the release key and leaves debug on the debug key', () => {
    const patched = signReleaseWithOwnKey(BUILD_GRADLE);
    const release = patched.slice(patched.indexOf('        release {\n            // Caution'));
    expect(release).toContain('signingConfig signingConfigs.release');
    expect(release).not.toContain('signingConfig signingConfigs.debug');
    const debug = patched.slice(patched.indexOf('        debug {\n            signingConfig'));
    expect(
      debug.startsWith('        debug {\n            signingConfig signingConfigs.debug'),
    ).toBe(true);
  });

  it('reads every release key value from gradle properties or the environment', () => {
    const patched = signReleaseWithOwnKey(BUILD_GRADLE);
    for (const name of RELEASE_SIGNING_PROPERTIES) {
      expect(patched).toContain(`'${name}'`);
    }
    expect(patched).toContain('findProperty(name) ?: System.getenv(name)');
  });

  it('defines the release key before the android block that uses it', () => {
    const patched = signReleaseWithOwnKey(BUILD_GRADLE);
    expect(patched.indexOf('def releaseSigningValue')).toBeLessThan(patched.indexOf('\nandroid {'));
  });

  it('refuses to package a release build when a key value or the keystore file is missing', () => {
    const patched = signReleaseWithOwnKey(BUILD_GRADLE);
    expect(patched).toContain('graph.hasTask(":app:$it")');
    expect(patched).toContain("['packageRelease', 'bundleRelease']");
    expect(patched).toContain('throw new GradleException');
    expect(patched).toContain('does not exist');
  });

  it('never writes a secret value into the build file', () => {
    const patched = signReleaseWithOwnKey(BUILD_GRADLE);
    expect(patched.match(/storePassword/gu)).toHaveLength(2);
    expect(patched).toContain(
      "storePassword releaseSigningValue('SMARTEVERYTHING_RELEASE_STORE_PASSWORD')",
    );
  });

  it('changes nothing on a second run', () => {
    const once = signReleaseWithOwnKey(BUILD_GRADLE);
    expect(signReleaseWithOwnKey(once)).toBe(once);
  });

  it('fails loudly when the template no longer has the signing configs block', () => {
    const changed = BUILD_GRADLE.replace('    signingConfigs {\n', '    signingConfigsX {\n');
    expect(() => signReleaseWithOwnKey(changed)).toThrow(ReleaseSigningPluginError);
  });

  it('fails loudly when the template no longer has the android block', () => {
    const changed = BUILD_GRADLE.replace('\nandroid {\n', '\nandroidX {\n');
    expect(() => signReleaseWithOwnKey(changed)).toThrow(ReleaseSigningPluginError);
  });

  it('fails loudly when the release build type no longer signs with the debug key', () => {
    const changed = BUILD_GRADLE.replace(
      '            signingConfig signingConfigs.debug\n            minifyEnabled',
      '            minifyEnabled',
    );
    expect(() => signReleaseWithOwnKey(changed)).toThrow(ReleaseSigningPluginError);
  });
});
