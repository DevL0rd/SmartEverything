import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { appDeclaredVersion } from './app-manifest';
import { installedVersion, repositoryFile } from './versions';

const fromApp = createRequire(repositoryFile('apps/app/package.json'));

const PLUGIN_MANIFEST = z.object({
  peerDependencies: z.object({ expo: z.string() }),
});

describe('@config-plugins/react-native-webrtc contract', () => {
  it('is installed at exactly the version the app declares', () => {
    expect(installedVersion('@config-plugins/react-native-webrtc')).toBe(
      appDeclaredVersion('@config-plugins/react-native-webrtc'),
    );
  });

  it('declares support for the Expo SDK the app builds with', () => {
    const manifest = PLUGIN_MANIFEST.parse(
      fromApp('@config-plugins/react-native-webrtc/package.json'),
    );
    const sdk = Number(installedVersion('expo').split('.')[0]);
    const minimum = Number(/>=\s*(\d+)/.exec(manifest.peerDependencies.expo)?.[1]);
    expect(sdk).toBeGreaterThanOrEqual(minimum);
  });

  it('exports its config plugin as the default of app.plugin.js, which Expo resolves by name', () => {
    const plugin: unknown = fromApp('@config-plugins/react-native-webrtc/app.plugin.js');
    expect(z.object({ default: z.function() }).safeParse(plugin).success).toBe(true);
  });

  it('pairs with the react-native-webrtc release it was written for', () => {
    expect(installedVersion('react-native-webrtc')).toBe(appDeclaredVersion('react-native-webrtc'));
  });
});
