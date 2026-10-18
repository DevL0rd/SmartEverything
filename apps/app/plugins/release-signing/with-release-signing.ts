import { withAppBuildGradle, type ConfigPlugin } from 'expo/config-plugins.js';

export const RELEASE_SIGNING_PROPERTIES = [
  'SMARTEVERYTHING_RELEASE_STORE_FILE',
  'SMARTEVERYTHING_RELEASE_STORE_PASSWORD',
  'SMARTEVERYTHING_RELEASE_KEY_ALIAS',
  'SMARTEVERYTHING_RELEASE_KEY_PASSWORD',
] as const;

const [STORE_FILE, STORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD] = RELEASE_SIGNING_PROPERTIES;

const SIGNING_CONFIGS_ANCHOR = '    signingConfigs {\n';
const ANDROID_ANCHOR = '\nandroid {\n';
const RELEASE_SIGNED_WITH_DEBUG =
  /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/u;

const SIGNING_VALUES = `
def releaseSigningNames = [${RELEASE_SIGNING_PROPERTIES.map((name) => `'${name}'`).join(', ')}]
def releaseSigningValue = { String name -> findProperty(name) ?: System.getenv(name) }
`;

const RELEASE_SIGNING_CONFIG = `        release {
            if (releaseSigningNames.every { releaseSigningValue(it) }) {
                storeFile file(releaseSigningValue('${STORE_FILE}'))
                storePassword releaseSigningValue('${STORE_PASSWORD}')
                keyAlias releaseSigningValue('${KEY_ALIAS}')
                keyPassword releaseSigningValue('${KEY_PASSWORD}')
            }
        }
`;

const REFUSE_UNSIGNED_RELEASE = `
gradle.taskGraph.whenReady { graph ->
    if (['packageRelease', 'bundleRelease'].any { graph.hasTask(":app:$it") }) {
        def missing = releaseSigningNames.findAll { !releaseSigningValue(it) }
        if (!missing.isEmpty()) {
            throw new GradleException("A release build needs its signing key: set \${missing.join(', ')} as gradle properties or environment variables.")
        }
        if (!file(releaseSigningValue('${STORE_FILE}')).isFile()) {
            throw new GradleException("The release keystore named by ${STORE_FILE} does not exist.")
        }
    }
}
`;

export class ReleaseSigningPluginError extends Error {
  override readonly name = 'ReleaseSigningPluginError';
  readonly missing: string;

  constructor(missing: string) {
    super(
      `The release-signing config plugin could not find "${missing.trim()}" in app/build.gradle`,
    );
    this.missing = missing;
  }
}

function requireAnchor(source: string, anchor: string): void {
  if (!source.includes(anchor)) {
    throw new ReleaseSigningPluginError(anchor);
  }
}

export function signReleaseWithOwnKey(source: string): string {
  if (source.includes(STORE_FILE)) {
    return source;
  }
  requireAnchor(source, SIGNING_CONFIGS_ANCHOR);
  requireAnchor(source, ANDROID_ANCHOR);
  if (!RELEASE_SIGNED_WITH_DEBUG.test(source)) {
    throw new ReleaseSigningPluginError('release { signingConfig signingConfigs.debug');
  }
  return `${source
    .replace(ANDROID_ANCHOR, `${SIGNING_VALUES}${ANDROID_ANCHOR}`)
    .replace(SIGNING_CONFIGS_ANCHOR, `${SIGNING_CONFIGS_ANCHOR}${RELEASE_SIGNING_CONFIG}`)
    .replace(RELEASE_SIGNED_WITH_DEBUG, '$1signingConfig signingConfigs.release')
    .trimEnd()}\n${REFUSE_UNSIGNED_RELEASE}`;
}

type BuildGradleConfig = Parameters<Parameters<typeof withAppBuildGradle>[1]>[0];

function buildGradleEdit(modified: BuildGradleConfig): BuildGradleConfig {
  return {
    ...modified,
    modResults: {
      ...modified.modResults,
      contents: signReleaseWithOwnKey(modified.modResults.contents),
    },
  };
}

export const withReleaseSigning: ConfigPlugin = (config) =>
  withAppBuildGradle(config, buildGradleEdit);
