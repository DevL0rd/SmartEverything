import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { APP_MANIFEST, declaredVersion, readRepositoryJson } from './contract-helpers';
import { installedVersion, repositoryFile } from './versions';

const PACKAGE = 'node_modules/expo-updates';

function source(relativePath: string): string {
  return readFileSync(repositoryFile(`${PACKAGE}/${relativePath}`), 'utf8');
}

describe('expo-updates contract', () => {
  it('is declared by the app at the installed version', () => {
    expect(declaredVersion(APP_MANIFEST, 'expo-updates')).toBe(installedVersion('expo-updates'));
  });

  it('is a release inside the range that expo 57 bundles, so the native build matches the SDK', () => {
    const bundled = readRepositoryJson(
      'node_modules/expo/bundledNativeModules.json',
      z.record(z.string(), z.string()),
    );
    const [major, minor, patch] = installedVersion('expo-updates').split('.').map(Number);
    expect(bundled['expo-updates']).toMatch(/^~57\.0\.\d+$/u);
    expect([major, minor]).toEqual([57, 0]);
    expect(patch).toBeGreaterThanOrEqual(25);
  });

  it('exports the checks, fetch, reload and the request header override the app clears', () => {
    const updates = source('build/Updates.d.ts');
    expect(updates).toMatch(
      /export declare function checkForUpdateAsync\(\): Promise<UpdateCheckResult>;/u,
    );
    expect(updates).toMatch(
      /export declare function fetchUpdateAsync\(\): Promise<UpdateFetchResult>;/u,
    );
    expect(updates).toMatch(/export declare function reloadAsync\(options\?: \{/u);
    expect(updates).toMatch(
      /export declare function setUpdateRequestHeadersOverride\(requestHeaders: Record<string, string> \| null\): void;/u,
    );
  });

  it('sends extra params in their own header, outside the request headers every stored update must match', () => {
    const java = 'android/src/main/java/expo/modules/updates';
    expect(source('build/Updates.d.ts')).toMatch(
      /export declare function setExtraParamAsync\(key: string, value: string \| null \| undefined\): Promise<void>;/u,
    );
    expect(source(`${java}/loader/FileDownloader.kt`)).toContain(
      'extraHeaders.put("Expo-Extra-Params", Dictionary.valueOf(',
    );
    expect(source(`${java}/selectionpolicy/LauncherSelectionPolicyFilterAware.kt`)).toContain(
      'it.url == config.updateUrl && it.requestHeaders == config.requestHeaders',
    );
    expect(source(`${java}/manifest/ExpoUpdatesUpdate.kt`)).toContain(
      'requestHeaders = configuration.requestHeaders',
    );
  });

  it('exports what a launch reports about itself', () => {
    const updates = source('build/Updates.d.ts');
    expect(updates).toMatch(/export declare const isEmergencyLaunch: boolean;/u);
    expect(updates).toMatch(/export declare const emergencyLaunchReason: string \| null;/u);
    expect(updates).toMatch(/export declare const isEmbeddedLaunch: boolean;/u);
    expect(updates).toMatch(/export declare const updateId: string \| null;/u);
    expect(updates).toMatch(/export declare const createdAt: Date \| null;/u);
    expect(updates).toMatch(/export declare const runtimeVersion: string \| null;/u);
    expect(updates).toMatch(/export declare const channel: string \| null;/u);
  });

  it('exports the useUpdates hook from the package entry', () => {
    expect(source('build/index.d.ts')).toContain("export * from './UseUpdates';");
    expect(source('build/UseUpdates.d.ts')).toMatch(
      /export declare const useUpdates: \(\) => UseUpdatesReturnType;/u,
    );
  });

  it('requires its native module at import, so the app imports it only after probing for the module', () => {
    expect(source('build/ExpoUpdates.js')).toContain("requireNativeModule('ExpoUpdates')");
  });

  it('offers the command that resolves the runtime version of a project', () => {
    expect(source('cli/build/cli.js')).toContain("'runtimeversion:resolve'");
    expect(source('package.json')).toMatch(/"expo-updates": "bin\/cli\.js"/u);
  });
});
