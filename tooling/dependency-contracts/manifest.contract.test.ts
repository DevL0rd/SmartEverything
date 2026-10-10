import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { declaredPackageNames, declaredVersion } from './versions';
import { appDeclaredPackageNames, appDeclaredVersion } from './app-manifest';

const here = dirname(fileURLToPath(import.meta.url));

const EXPO_MANAGED =
  /^(expo|expo-.*|@expo\/.*|react|react-dom|react-native|react-native-.*|@react-native\/.*|@react-native-async-storage\/.*|babel-plugin-react-compiler|@babel\/core|@types\/react|typescript)$/;

function contractFileFor(packageName: string): string {
  return `${packageName.replace('@', '').replace('/', '-')}.contract.test.ts`;
}

function externalRootPackages(): readonly string[] {
  return declaredPackageNames().filter((name) => !name.startsWith('@smarteverything/'));
}

function contractFilesPresent(): ReadonlySet<string> {
  return new Set(readdirSync(here).filter((file) => file.endsWith('.contract.test.ts')));
}

describe('dependency manifest', () => {
  it('pins every root dependency to an exact version with no range', () => {
    const ranged = externalRootPackages().filter((name) => /^[\^~><]/.test(declaredVersion(name)));
    expect(ranged).toStrictEqual([]);
  });

  it('pins every application dependency to an exact version with no range', () => {
    const ranged = appDeclaredPackageNames()
      .filter((name) => !name.startsWith('@smarteverything/'))
      .filter((name) => /^[\^~><]/.test(appDeclaredVersion(name)));
    expect(ranged).toStrictEqual([]);
  });

  it('has a contract test file for every root dependency', () => {
    const present = contractFilesPresent();
    const missing = externalRootPackages().filter((name) => !present.has(contractFileFor(name)));
    expect(missing).toStrictEqual([]);
  });

  it('needs no contract test for a package of our own, which has its own suite', () => {
    expect(declaredPackageNames()).toContain('@smarteverything/logging');
    expect(externalRootPackages()).not.toContain('@smarteverything/logging');
  });

  it('has a contract test for every application dependency the Expo SDK does not manage', () => {
    const present = contractFilesPresent();
    const missing = appDeclaredPackageNames()
      .filter((name) => !name.startsWith('@smarteverything/'))
      .filter((name) => !EXPO_MANAGED.test(name))
      .filter((name) => !present.has(contractFileFor(name)));
    expect(missing).toStrictEqual([]);
  });
});
