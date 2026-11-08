import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const PACKAGE = 'node_modules/expo-file-system';

function source(relativePath: string): string {
  return readFileSync(repositoryFile(`${PACKAGE}/${relativePath}`), 'utf8');
}

describe('expo-file-system contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'expo-file-system')).toBe(
      installedVersion('expo-file-system'),
    );
  });

  it('is the release that expo 57 bundles, so no second native build is pulled in', () => {
    const bundled: unknown = JSON.parse(
      readFileSync(repositoryFile('node_modules/expo/bundledNativeModules.json'), 'utf8'),
    );
    expect(bundled).toMatchObject({
      'expo-file-system': `~${installedVersion('expo-file-system')}`,
    });
  });

  it('exports the file, directory and path classes of the object API', () => {
    const index = source('build/index.d.ts');
    expect(index).toContain("export { Paths } from './Paths';");
    expect(index).toContain("export { File } from './File';");
    expect(index).toContain("export { Directory } from './Directory';");
  });

  it('offers a cache directory the system may clear, which only costs a rebake', () => {
    expect(source('build/Paths.d.ts')).toMatch(/static get cache\(\): Directory;/u);
  });

  it('writes bytes, reads them back and deletes a file synchronously', () => {
    const native = source('build/internal/NativeFileSystem.types.d.ts');
    expect(native).toMatch(
      /write\(content: string \| Uint8Array, options\?: FileWriteOptions\): void;/u,
    );
    expect(native).toMatch(/bytes\(\): Promise<Uint8Array<ArrayBuffer>>;/u);
    expect(native).toMatch(/delete\(\): void;/u);
  });

  it('creates directories and lists their entries, so superseded cache entries can be deleted', () => {
    const native = source('build/internal/NativeFileSystem.types.d.ts');
    expect(native).toMatch(/create\(options\?: DirectoryCreateOptions\): void;/u);
    expect(native).toMatch(/list\(\): \(PublicDirectory \| PublicFile\)\[\];/u);
  });
});
