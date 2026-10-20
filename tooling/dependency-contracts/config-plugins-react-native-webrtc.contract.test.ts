import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const fromApp = createRequire(repositoryFile('apps/app/package.json'));

const PLUGIN_MANIFEST = z.object({
  peerDependencies: z.object({ expo: z.string() }),
});

describe('@config-plugins/react-native-webrtc contract', () => {
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
    expect(`npm:@stream-io/react-native-webrtc@${installedVersion('react-native-webrtc')}`).toBe(
      declaredVersion(APP_MANIFEST, 'react-native-webrtc'),
    );
  });
});
