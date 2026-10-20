import {
  withGradleProperties,
  withSettingsGradle,
  type ConfigPlugin,
} from 'expo/config-plugins.js';

export type AndroidVariant = 'release' | 'development';

export const DEVELOPMENT_ONLY_MODULES = [
  'expo-dev-client',
  'expo-dev-launcher',
  'expo-dev-menu',
  'expo-dev-menu-interface',
] as const;

export const GRADLE_JVM_ARGS = '-Xmx6g -XX:MaxMetaspaceSize=1g';

const USE_EXPO_MODULES = 'expoAutolinking.useExpoModules()\n';

const EXCLUDE_LINE = /^expoAutolinking\.exclude = .*\n/mu;

export class AndroidBuildPluginError extends Error {
  override readonly name = 'AndroidBuildPluginError';
  readonly missing: string;

  constructor(missing: string) {
    super(`The android-build config plugin could not find "${missing.trim()}" in settings.gradle`);
    this.missing = missing;
  }
}

export function excludedModules(variant: AndroidVariant): readonly string[] {
  return variant === 'release' ? DEVELOPMENT_ONLY_MODULES : [];
}

export function linkModulesFor(source: string, variant: AndroidVariant): string {
  if (!source.includes(USE_EXPO_MODULES)) throw new AndroidBuildPluginError(USE_EXPO_MODULES);
  const cleared = source.replace(EXCLUDE_LINE, '');
  const excluded = excludedModules(variant);
  if (excluded.length === 0) return cleared;
  const line = `expoAutolinking.exclude = [${excluded.map((name) => `'${name}'`).join(', ')}]\n`;
  return cleared.replace(USE_EXPO_MODULES, `${line}${USE_EXPO_MODULES}`);
}

type SettingsConfig = Parameters<Parameters<typeof withSettingsGradle>[1]>[0];
type PropertiesConfig = Parameters<Parameters<typeof withGradleProperties>[1]>[0];
type PropertiesItem = PropertiesConfig['modResults'][number];

export function withJvmArgs(items: readonly PropertiesItem[]): PropertiesItem[] {
  const others = items.filter(
    (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs'),
  );
  return [...others, { type: 'property', key: 'org.gradle.jvmargs', value: GRADLE_JVM_ARGS }];
}

function settingsEdit(variant: AndroidVariant): (modified: SettingsConfig) => SettingsConfig {
  return function editSettings(modified) {
    return {
      ...modified,
      modResults: {
        ...modified.modResults,
        contents: linkModulesFor(modified.modResults.contents, variant),
      },
    };
  };
}

function propertiesEdit(modified: PropertiesConfig): PropertiesConfig {
  return { ...modified, modResults: withJvmArgs(modified.modResults) };
}

export const withAndroidBuild: ConfigPlugin<{ variant: AndroidVariant }> = (config, { variant }) =>
  withGradleProperties(withSettingsGradle(config, settingsEdit(variant)), propertiesEdit);
