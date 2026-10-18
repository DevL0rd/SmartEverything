import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { APP_MANIFEST, declaredPackageNames, workspaceManifestPaths } from './contract-helpers';
import { importedSurfaces } from './source-imports';

const here = dirname(fileURLToPath(import.meta.url));

const EXPO_MANAGED =
  /^(expo|expo-.*|@expo\/.*|react|react-dom|react-native|react-native-.*|@react-native\/.*|@react-native-async-storage\/.*|babel-plugin-react-compiler|@babel\/core|@types\/react|typescript)$/;

const TYPES_OR_BUILD_ONLY =
  /^(@types\/.*|@electron-forge\/.*|@electron\/fuses|png2icons|electron|@img\/sharp-wasm32)$/;

export interface LoadTarget {
  readonly specifier: string;
  readonly names: ReadonlySet<string>;
}

function contractFileFor(packageName: string): string {
  return `${packageName.replace('@', '').replace('/', '-')}.contract.test.ts`;
}

function hasDedicatedContract(packageName: string): boolean {
  return readdirSync(here).includes(contractFileFor(packageName));
}

function externalDependencies(manifest: string): readonly string[] {
  return declaredPackageNames(manifest)
    .filter((name) => !name.startsWith('@smarteverything/'))
    .filter((name) => !TYPES_OR_BUILD_ONLY.test(name));
}

export function applicationWithoutContract(): readonly string[] {
  return externalDependencies(APP_MANIFEST)
    .filter((name) => !EXPO_MANAGED.test(name))
    .filter((name) => !hasDedicatedContract(name));
}

export function loadTargets(): readonly LoadTarget[] {
  const imported = importedSurfaces();
  const declared = new Set(
    workspaceManifestPaths()
      .filter((manifest) => manifest !== APP_MANIFEST)
      .flatMap(externalDependencies)
      .filter((name) => !hasDedicatedContract(name)),
  );
  const used = imported.filter(({ packageName }) => declared.has(packageName));
  const unused = [...declared].filter((name) => !used.some((use) => use.packageName === name));
  return [
    ...used.map(({ specifier, names }) => ({ specifier, names })),
    ...unused.map((specifier) => ({ specifier, names: new Set<string>() })),
  ];
}
