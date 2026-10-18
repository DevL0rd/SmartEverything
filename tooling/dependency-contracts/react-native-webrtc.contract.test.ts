import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { repositoryFile } from './versions';

const MODULE_SOURCES =
  'node_modules/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule';
const MEDIA_AUDIO =
  'apps/app/modules/health-connect/android/src/main/java/expo/modules/healthconnect/media/MediaAudioPackage.kt';

function source(relativePath: string): string {
  return readFileSync(repositoryFile(relativePath), 'utf8');
}

function constructorOf(java: string): string {
  const start = java.indexOf('public WebRTCModule(ReactApplicationContext reactContext)');
  const end = java.indexOf('public String getName()', start);
  expect(start).toBeGreaterThan(-1);
  return java.slice(start, end);
}

describe('react-native-webrtc contract', () => {
  it('builds a new audio device module from the configured factory for every module instance, because each JS reload creates a new peer connection factory', () => {
    const body = constructorOf(source(`${MODULE_SOURCES}/WebRTCModule.java`));

    expect(body).toContain('options.audioDeviceModuleFactory.create(reactContext)');
    expect(body).not.toMatch(/=\s*options\.audioDeviceModule\s*;/u);
  });

  it('offers no shared audio device module that a reloaded instance would reuse after the first factory released it', () => {
    const options = source(`${MODULE_SOURCES}/WebRTCModuleOptions.java`);

    expect(options).toContain('public AudioDeviceModuleFactory audioDeviceModuleFactory;');
    expect(options).not.toMatch(/public\s+AudioDeviceModule\s+audioDeviceModule\s*;/u);
  });

  it('receives a media playback factory from the app instead of one prebuilt module', () => {
    const media = source(MEDIA_AUDIO);

    expect(media).toMatch(
      /audioDeviceModuleFactory = WebRTCModuleOptions\.AudioDeviceModuleFactory \{ context ->\s+JavaAudioDeviceModule\.builder\(context\)/u,
    );
    expect(media).toContain('.setAudioAttributes(playback)');
    expect(media).not.toMatch(/\.audioDeviceModule\s*=/u);
  });

  it('turns its own debug logger on only in development, so a release build prints no per-call peer connection lines', () => {
    const entry = source('node_modules/react-native-webrtc/src/index.ts');

    expect(entry).toMatch(/if \(__DEV__\) \{\s+Logger\.enable\(/u);
    expect(entry.match(/Logger\.enable\(/gu)).toHaveLength(1);
  });
});
