import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const PACKAGE = 'node_modules/expo-image';

function source(relativePath: string): string {
  return readFileSync(repositoryFile(`${PACKAGE}/${relativePath}`), 'utf8');
}

describe('expo-image contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'expo-image')).toBe(installedVersion('expo-image'));
  });

  it('is the release that expo 57 bundles', () => {
    const bundled: unknown = JSON.parse(
      readFileSync(repositoryFile('node_modules/expo/bundledNativeModules.json'), 'utf8'),
    );
    expect(bundled).toMatchObject({ 'expo-image': `~${installedVersion('expo-image')}` });
  });

  it('exports the image component and the image hook', () => {
    const index = source('build/index.d.ts');
    expect(index).toContain("export { Image } from './Image';");
    expect(index).toContain("export { useImage } from './useImage';");
  });

  it('recycles list cells by key so a reused cell never shows the previous source', () => {
    expect(source('build/Image.types.d.ts')).toMatch(/recyclingKey\?: string \| null;/u);
  });

  it('caches on disk only, so decoded bitmaps of off-screen items are not held in memory', () => {
    expect(source('build/Image.types.d.ts')).toMatch(
      /cachePolicy\?: 'none' \| 'disk' \| 'memory' \| 'memory-disk'/u,
    );
  });

  it('tints an image with a colour, which the emissive masks need', () => {
    expect(source('build/Image.types.d.ts')).toMatch(/tintColor\?: string \| null;/u);
  });

  it('registers one native module for autolinking', () => {
    const config: unknown = JSON.parse(source('expo-module.config.json'));
    expect(config).toMatchObject({
      android: { modules: ['expo.modules.image.ExpoImageModule'] },
    });
  });

  it('is MIT licensed', () => {
    const manifest: unknown = JSON.parse(source('package.json'));
    expect(manifest).toMatchObject({ license: 'MIT' });
  });
});
