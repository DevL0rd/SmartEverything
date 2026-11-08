import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { APP_MANIFEST, declaredVersion, readRepositoryJson } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const PACKAGE = 'node_modules/expo-media-library';

function source(relativePath: string): string {
  return readFileSync(repositoryFile(`${PACKAGE}/${relativePath}`), 'utf8');
}

function patchOf(version: string): readonly [string, number] {
  const [major = '', minor = '', patch = ''] = version.replace(/^~/u, '').split('.');
  return [`${major}.${minor}`, Number(patch)];
}

describe('expo-media-library contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'expo-media-library')).toBe(
      installedVersion('expo-media-library'),
    );
  });

  it('is a release of the line that expo 57 bundles, so no second native build is pulled in', () => {
    const bundled = readRepositoryJson(
      'node_modules/expo/bundledNativeModules.json',
      z.record(z.string(), z.string()),
    );
    const range = bundled['expo-media-library'] ?? '';
    const [bundledLine, bundledPatch] = patchOf(range);
    const [installedLine, installedPatch] = patchOf(installedVersion('expo-media-library'));
    expect(installedLine).toBe(bundledLine);
    expect(installedPatch).toBeGreaterThanOrEqual(bundledPatch);
  });

  it('exports the next API from the package root and the old API only from legacy', () => {
    const manifest = readRepositoryJson(
      `${PACKAGE}/package.json`,
      z.looseObject({ exports: z.record(z.string(), z.unknown()) }),
    );
    expect(manifest.exports).toHaveProperty('./legacy');
    expect(manifest.exports).toHaveProperty('./next');
    expect(source('src/index.ts')).toContain(
      "import ExpoMediaLibraryNext from './ExpoMediaLibraryNext';",
    );
  });

  it('requires its native module at import time, so an older runtime must be probed before importing', () => {
    expect(source('src/ExpoMediaLibraryNext.ts')).toContain(
      "requireNativeModule<ExpoMediaLibraryNextModule>('ExpoMediaLibraryNext')",
    );
  });

  it('exports the query, asset and album classes with the permission and change functions', () => {
    const index = source('src/index.ts');
    expect(index).toContain('export class Query extends ExpoMediaLibraryNext.Query {}');
    expect(index).toContain('export class Asset extends ExpoMediaLibraryNext.Asset {');
    expect(index).toContain('export class Album extends ExpoMediaLibraryNext.Album {}');
    expect(index).toContain('export async function requestPermissionsAsync(');
    expect(index).toContain('export async function getPermissionsAsync(');
    expect(index).toContain('export async function presentPermissionsPicker(');
    expect(index).toContain('export function addListener(');
  });

  it('takes granular permissions and reports limited access', () => {
    expect(source('src/types/GranularPermission.ts')).toContain(
      "export type GranularPermission = 'audio' | 'photo' | 'video';",
    );
    expect(source('src/MediaLibraryNext.types.ts')).toContain(
      "accessPrivileges?: 'all' | 'limited' | 'none';",
    );
  });

  it('scans by modification time with a lower bound and reads metadata in one query', () => {
    const fields = source('src/types/AssetField.ts');
    expect(fields).toContain("MODIFICATION_TIME = 'modificationTime',");
    const query = source('src/types/Query.ts');
    expect(query).toMatch(/gt\(field: AssetField, value: number\): Query;/u);
    expect(query).toMatch(/orderBy\(sortDescriptors: SortDescriptor \| AssetField\): Query;/u);
    expect(query).toMatch(/exeForMetadata\(\): Promise<AssetMetadata\[\]>;/u);
  });

  it('lists asset metadata without size, mime type or content hash, which the local module adds', () => {
    const metadata = source('src/types/AssetMetadata.ts');
    expect(metadata).toContain('  id: string;');
    expect(metadata).toContain('  modificationTime: number | null;');
    expect(metadata).not.toMatch(/\b(size|bytes|mimeType|sha256)\b/u);
  });

  it('resolves an asset to a readable uri and deletes assets through the system request', () => {
    const asset = source('src/types/Asset.ts');
    expect(asset).toMatch(/getUri\(\): Promise<string>;/u);
    expect(asset).toMatch(/static delete\(assets: Asset\[\]\): Promise<void>;/u);
  });

  it('notifies of library changes with an event that carries no detail on Android', () => {
    expect(source('src/types/MediaLibraryAssetsChangeEvent.ts')).toContain(
      'hasIncrementalChanges: boolean;',
    );
    expect(source('src/ExpoMediaLibraryNext.ts')).toContain(
      'mediaLibraryDidChange: (event: MediaLibraryAssetsChangeEvent) => void;',
    );
  });

  it('registers the next native module for autolinking on both platforms', () => {
    const config = readRepositoryJson(
      `${PACKAGE}/expo-module.config.json`,
      z.object({
        apple: z.object({ modules: z.array(z.string()) }),
        android: z.object({ modules: z.array(z.string()) }),
      }),
    );
    expect(config.apple.modules).toContain('MediaLibraryNextModule');
    expect(config.android.modules).toContain(
      'expo.modules.medialibrary.next.MediaLibraryNextModule',
    );
  });

  it('keeps original location through the plugin option that declares ACCESS_MEDIA_LOCATION', () => {
    const plugin = source('plugin/src/withMediaLibrary.ts');
    expect(plugin).toContain('isAccessMediaLocationEnabled?: boolean;');
    expect(plugin).toContain(
      "isAccessMediaLocationEnabled && 'android.permission.ACCESS_MEDIA_LOCATION'",
    );
  });

  it('declares only the image and video permissions the plugin is told to', () => {
    const plugin = source('plugin/src/withMediaLibrary.ts');
    expect(plugin).toContain("photo: 'android.permission.READ_MEDIA_IMAGES',");
    expect(plugin).toContain("video: 'android.permission.READ_MEDIA_VIDEO',");
    expect(plugin).toContain('granularPermissions = defaultGranularPermissions');
  });

  it('is MIT licensed', () => {
    const manifest: unknown = JSON.parse(source('package.json'));
    expect(manifest).toMatchObject({ license: 'MIT' });
  });
});
