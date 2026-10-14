import type { ExpoConfig } from 'expo/config';
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';
import { z } from 'zod';
import identity from './app-identity.json';
import manifest from './package.json';

const STORE_IDENTITY = z.object({ storeIdentity: z.string().min(1) }).parse(identity).storeIdentity;

const APP_VERSION = z.object({ version: z.string().min(1) }).parse(manifest).version;

const BUILD_ENVIRONMENT = z.object({
  EXPO_PUBLIC_SERVER_URL: z.url({ protocol: /^https$/ }).optional(),
  APP_VARIANT: z.enum(['development']).optional(),
});

const VARIANTS = {
  release: { name: 'SmartEverything', suffix: '', scheme: 'smarteverything' },
  development: {
    name: 'SmartEverything Dev',
    suffix: '.dev',
    scheme: 'smarteverything-dev',
  },
};

const PAIRING_CAMERA_USE =
  'SmartEverything uses the camera only to scan the pairing code your desktop shows.';

const FONT_FILES = [
  'Geist-Regular',
  'Geist-Medium',
  'Geist-SemiBold',
  'GeistMono-Regular',
  'GeistMono-Medium',
].map((name) => `./assets/fonts/${name}.ttf`);

const ANDROID_BUILD_PROPERTIES = {
  android: {
    minSdkVersion: 26,
    packagingOptions: {
      exclude: ['META-INF/INDEX.LIST'],
      merge: ['META-INF/io.netty.versions.properties'],
    },
  },
};

interface Extra {
  readonly privacyPolicyUrl: string | null;
}

const withMissingPrivacyPolicy: ConfigPlugin = (config) =>
  withAndroidManifest(config, () => {
    throw new Error(
      "Health Connect needs a privacy policy URL. Set EXPO_PUBLIC_SERVER_URL to your server's public https URL (its /privacy page is used) before building Android.",
    );
  });

const LOCATION_PLUGIN: NonNullable<ExpoConfig['plugins']>[number] = [
  'expo-location',
  {
    locationWhenInUsePermission:
      'SmartEverything uses your location once, when you set where your home is.',
    isAndroidBackgroundLocationEnabled: false,
    isAndroidForegroundServiceEnabled: false,
  },
];

function healthConnectPlugins(extra: Extra): NonNullable<ExpoConfig['plugins']> {
  return extra.privacyPolicyUrl === null
    ? []
    : [['./modules/health-connect/app.plugin.js', { privacyPolicyUrl: extra.privacyPolicyUrl }]];
}

function readEnvironment(): z.infer<typeof BUILD_ENVIRONMENT> {
  const parsed = BUILD_ENVIRONMENT.safeParse(process.env);
  if (!parsed.success) {
    const named = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`The build environment is malformed for ${named}.`);
  }
  return parsed.data;
}

function extraOf(environment: z.infer<typeof BUILD_ENVIRONMENT>): Extra {
  return {
    privacyPolicyUrl:
      environment.EXPO_PUBLIC_SERVER_URL === undefined
        ? null
        : `${environment.EXPO_PUBLIC_SERVER_URL.replace(/\/$/, '')}/privacy`,
  };
}

export default (): ExpoConfig => {
  const environment = readEnvironment();
  const extra = extraOf(environment);
  const variant = VARIANTS[environment.APP_VARIANT ?? 'release'];
  const config: ExpoConfig = {
    name: variant.name,
    slug: 'smarteverything',
    version: APP_VERSION,
    scheme: variant.scheme,
    orientation: 'default',
    userInterfaceStyle: 'dark',
    backgroundColor: '#0A0A0C',
    experiments: { typedRoutes: true, reactCompiler: true },
    plugins: [
      'expo-router',
      [
        '@config-plugins/react-native-webrtc',
        {
          cameraPermission: PAIRING_CAMERA_USE,
          microphonePermission:
            'SmartEverything uses the microphone only while you hold Talk on a camera.',
        },
      ],
      ['expo-build-properties', ANDROID_BUILD_PROPERTIES],
      ['expo-notifications', { color: '#F2B45E' }],
      [
        'expo-camera',
        {
          cameraPermission: PAIRING_CAMERA_USE,
          recordAudioAndroid: false,
        },
      ],
      ['expo-font', { fonts: FONT_FILES }],
      'expo-secure-store',
      LOCATION_PLUGIN,
      ...healthConnectPlugins(extra),
    ],
    icon: './assets/icon.png',
    web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
    android: {
      package: `${STORE_IDENTITY}${variant.suffix}`,
      googleServicesFile: './google-services.json',
    },
    runtimeVersion: { policy: 'appVersion' },
    updates: { enabled: false },
    extra,
  };
  return extra.privacyPolicyUrl === null ? withMissingPrivacyPolicy(config) : config;
};
