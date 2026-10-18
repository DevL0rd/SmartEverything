import { withMainApplication, type ConfigPlugin } from 'expo/config-plugins.js';

const FLAG_IMPORTS = [
  'import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags',
  'import com.facebook.react.internal.featureflags.ReactNativeNewArchitectureFeatureFlagsDefaults',
];

const LOAD_CALL = '    loadReactNative(this)\n';

const OVERRIDE = `    ReactNativeFeatureFlags.dangerouslyForceOverride(
      object : ReactNativeNewArchitectureFeatureFlagsDefaults() {
        override fun enableAccumulatedUpdatesInRawPropsAndroid(): Boolean = true
      }
    )
`;

const IMPORT_ANCHOR = 'import com.facebook.react.ReactHost\n';

export class AccumulatedUpdatesPluginError extends Error {
  override readonly name = 'AccumulatedUpdatesPluginError';
  readonly missing: string;

  constructor(missing: string) {
    super(
      `The accumulated-updates config plugin could not find "${missing.trim()}" in MainApplication.kt`,
    );
    this.missing = missing;
  }
}

function requireAnchor(source: string, anchor: string): void {
  if (!source.includes(anchor)) {
    throw new AccumulatedUpdatesPluginError(anchor);
  }
}

export function enableAccumulatedUpdates(source: string): string {
  if (source.includes('enableAccumulatedUpdatesInRawPropsAndroid')) {
    return source;
  }
  requireAnchor(source, IMPORT_ANCHOR);
  requireAnchor(source, LOAD_CALL);
  return source
    .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}${FLAG_IMPORTS.join('\n')}\n`)
    .replace(LOAD_CALL, `${LOAD_CALL}${OVERRIDE}`);
}

type MainApplicationConfig = Parameters<Parameters<typeof withMainApplication>[1]>[0];

function mainApplicationEdit(modified: MainApplicationConfig): MainApplicationConfig {
  return {
    ...modified,
    modResults: {
      ...modified.modResults,
      contents: enableAccumulatedUpdates(modified.modResults.contents),
    },
  };
}

export const withAccumulatedUpdates: ConfigPlugin = (config) =>
  withMainApplication(config, mainApplicationEdit);
