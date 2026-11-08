import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { APP_MANIFEST, declaredVersion, readRepositoryJson } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const PACKAGE = 'node_modules/expo-video';

function source(relativePath: string): string {
  return readFileSync(repositoryFile(`${PACKAGE}/${relativePath}`), 'utf8');
}

function patchOf(version: string): readonly [string, number] {
  const [major = '', minor = '', patch = ''] = version.replace(/^~/u, '').split('.');
  return [`${major}.${minor}`, Number(patch)];
}

describe('expo-video contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'expo-video')).toBe(installedVersion('expo-video'));
  });

  it('is a release of the line that expo 57 bundles, so no second native build is pulled in', () => {
    const bundled = readRepositoryJson(
      'node_modules/expo/bundledNativeModules.json',
      z.record(z.string(), z.string()),
    );
    const range = bundled['expo-video'] ?? '';
    const [bundledLine, bundledPatch] = patchOf(range);
    const [installedLine, installedPatch] = patchOf(installedVersion('expo-video'));
    expect(installedLine).toBe(bundledLine);
    expect(installedPatch).toBeGreaterThanOrEqual(bundledPatch);
  });

  it('exports the view and the player hook', () => {
    const index = source('build/index.d.ts');
    expect(index).toContain("export { VideoView } from './VideoView';");
    expect(index).toContain("export { useVideoPlayer } from './VideoPlayer';");
  });

  it('exposes the player state the scrubber draws: position, length, buffered range and status', () => {
    const player = source('build/VideoPlayer.types.d.ts');
    expect(player).toMatch(/currentTime: number;/u);
    expect(player).toMatch(/readonly duration: number;/u);
    expect(player).toMatch(/readonly bufferedPosition: number;/u);
    expect(player).toMatch(/readonly status: VideoPlayerStatus;/u);
    expect(player).toMatch(
      /type VideoPlayerStatus = 'idle' \| 'loading' \| 'readyToPlay' \| 'error';/u,
    );
  });

  it('plays, pauses and mutes through the player, which Space and the mute control drive', () => {
    const player = source('build/VideoPlayer.types.d.ts');
    expect(player).toMatch(/play\(\): void;/u);
    expect(player).toMatch(/pause\(\): void;/u);
    expect(player).toMatch(/muted: boolean;/u);
  });

  it('emits events for the playing flag, the status and the end of playback, so no polling is needed', () => {
    const events = source('build/VideoPlayerEvents.types.d.ts');
    expect(events).toMatch(/playingChange\(payload: PlayingChangeEventPayload\): void;/u);
    expect(events).toMatch(/statusChange\(payload: StatusChangeEventPayload\): void;/u);
    expect(events).toMatch(/playToEnd\(\): void;/u);
  });

  it('generates thumbnails at given times, which the phone scrub preview uses', () => {
    expect(source('build/VideoPlayer.types.d.ts')).toMatch(
      /generateThumbnailsAsync\(times: number \| number\[\], options\?: VideoThumbnailOptions\): Promise<VideoThumbnail\[\]>;/u,
    );
  });

  it('loads a source asynchronously from a uri with request headers', () => {
    const player = source('build/VideoPlayer.types.d.ts');
    expect(player).toMatch(/replaceAsync\(source: VideoSource\): Promise<void>;/u);
    expect(player).toMatch(/type VideoSource = string \| number \| null \| VideoSourceObject;/u);
    expect(player).toMatch(/headers\?: Record<string, string>;/u);
  });

  it('stops playing in the background unless asked to, so playback follows visibility', () => {
    expect(source('build/VideoPlayer.types.d.ts')).toMatch(/staysActiveInBackground: boolean;/u);
  });

  it('draws its own controls over a native surface and reports fullscreen changes', () => {
    const view = source('build/VideoView.types.d.ts');
    expect(view).toMatch(/nativeControls\?: boolean;/u);
    expect(view).toMatch(/onFullscreenEnter\?: \(\) => void;/u);
    expect(view).toMatch(/onFullscreenExit\?: \(\) => void;/u);
    expect(view).toMatch(/onFirstFrameRender\?: \(\) => void;/u);
  });

  it('registers one native module per platform for autolinking', () => {
    const config: unknown = JSON.parse(source('expo-module.config.json'));
    expect(config).toMatchObject({
      apple: { modules: ['VideoModule'] },
      android: { modules: ['expo.modules.video.VideoModule'] },
    });
  });

  it('ships a config plugin entry point', () => {
    expect(source('app.plugin.js')).toContain("require('./plugin/build/withExpoVideo')");
  });

  it('is MIT licensed', () => {
    const manifest: unknown = JSON.parse(source('package.json'));
    expect(manifest).toMatchObject({ license: 'MIT' });
  });
});
