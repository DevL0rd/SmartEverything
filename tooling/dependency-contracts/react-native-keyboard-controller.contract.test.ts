import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { APP_MANIFEST, declaredVersion, readRepositoryJson } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const PACKAGE = 'react-native-keyboard-controller';
const BUNDLED = z.record(z.string(), z.string());
const MANIFEST = z.looseObject({
  peerDependencies: z.record(z.string(), z.string()),
});

function manifest(): z.infer<typeof MANIFEST> {
  return readRepositoryJson(`node_modules/${PACKAGE}/package.json`, MANIFEST);
}

describe('react-native-keyboard-controller contract', () => {
  it('is the build Expo SDK 57 bundles, so it links against the native runtime the app uses', () => {
    const bundled = readRepositoryJson('node_modules/expo/bundledNativeModules.json', BUNDLED);
    expect(bundled[PACKAGE]).toBe(installedVersion(PACKAGE));
    expect(declaredVersion(APP_MANIFEST, PACKAGE)).toBe(installedVersion(PACKAGE));
  });

  it('animates through Reanimated, which the app declares', () => {
    expect(Object.keys(manifest().peerDependencies)).toContain('react-native-reanimated');
    expect(declaredVersion(APP_MANIFEST, 'react-native-reanimated')).toBe(
      installedVersion('react-native-reanimated'),
    );
  });

  it('exports the provider and the avoiding view the screens are built on', () => {
    const root = `node_modules/${PACKAGE}/lib/typescript`;
    const read = (file: string): string => readFileSync(repositoryFile(`${root}/${file}`), 'utf8');
    expect(read('index.d.ts')).toContain('KeyboardAvoidingView');
    expect(read('index.d.ts')).toContain('./animated');
    expect(read('animated.d.ts')).toContain('KeyboardProvider');
  });
});
