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

describe('react-native-webrtc contract', () => {
  it('builds every audio device module with the playback attributes the app configured, so camera audio is not routed as a voice call', () => {
    const provider = source(`${MODULE_SOURCES}/PeerConnectionFactoryProvider.java`);

    expect(provider).toContain(
      'AudioAttributes audioAttributes = WebRTCModuleOptions.getInstance().audioAttributes;',
    );
    expect(provider).toMatch(
      /if \(audioAttributes != null\) \{\s+builder\.setAudioAttributes\(audioAttributes\);/u,
    );
  });

  it('offers the playback attributes as a public option', () => {
    const options = source(`${MODULE_SOURCES}/WebRTCModuleOptions.java`);

    expect(options).toContain('public AudioAttributes audioAttributes;');
  });

  it('receives media playback attributes from the app instead of an audio device module', () => {
    const media = source(MEDIA_AUDIO);

    expect(media).toMatch(/WebRTCModuleOptions\.getInstance\(\)\.audioAttributes = playback/u);
    expect(media).toContain('.setUsage(AudioAttributes.USAGE_MEDIA)');
    expect(media).not.toContain('JavaAudioDeviceModule');
  });

  it('turns its own debug logger on only in development, so a release build prints no per-call peer connection lines', () => {
    const entry = source('node_modules/react-native-webrtc/src/index.ts');

    expect(entry).toMatch(/if \(__DEV__\) \{\s+Logger\.enable\(/u);
    expect(entry.match(/Logger\.enable\(/gu)).toHaveLength(1);
  });
});
