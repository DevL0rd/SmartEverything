import type { ExpoConfig } from 'expo/config';
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';
import { z } from 'zod';
import identity from './app-identity.json';
import manifest from './package.json';

const APPLICATION_ID = z.object({ applicationId: z.string().min(1) }).parse(identity).applicationId;

const APP_VERSION = z.object({ version: z.string().min(1) }).parse(manifest).version;

const BUILD_ENVIRONMENT = z.object({
  EXPO_PUBLIC_SERVER_URL: z.url({ protocol: /^https$/ }).optional(),
  ANDROID_VERSION_CODE: z.coerce.number().int().min(3).max(2100000000).optional(),
  ANDROID_VARIANT: z.enum(['release', 'development']).default('development'),
});

const CAMERA_USE =
  'SmartEverything uses the camera to scan pairing codes and barcodes, and to show the assistant what you point it at while you are in a call with the camera on.';

const MICROPHONE_USE =
  'SmartEverything uses the microphone to listen for your wake word when you turn that on, to talk to the assistant, and to talk through a camera.';

const LOCATION_USE =
  'SmartEverything uses your location to set where your home is, to know when you are home or away, and to run automations when you arrive or leave.';

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

const WEBRTC_PLUGIN: NonNullable<ExpoConfig['plugins']>[number] = [
  '@config-plugins/react-native-webrtc',
  {
    cameraPermission: CAMERA_USE,
    microphonePermission: MICROPHONE_USE,
  },
];

const SPLASH_PLUGIN: NonNullable<ExpoConfig['plugins']>[number] = [
  'expo-splash-screen',
  { image: './assets/adaptive-foreground.png', imageWidth: 200, backgroundColor: '#0A0A0C' },
];

const CAMERA_PLUGIN: NonNullable<ExpoConfig['plugins']>[number] = [
  'expo-camera',
  { cameraPermission: CAMERA_USE, recordAudioAndroid: false },
];

const LOCATION_PLUGIN: NonNullable<ExpoConfig['plugins']>[number] = [
  'expo-location',
  {
    locationWhenInUsePermission: LOCATION_USE,
    isAndroidBackgroundLocationEnabled: false,
    isAndroidForegroundServiceEnabled: false,
  },
];

function healthConnectPlugins(extra: Extra): NonNullable<ExpoConfig['plugins']> {
  return extra.privacyPolicyUrl === null
    ? []
    : [['./modules/health-connect/app.plugin.js', { privacyPolicyUrl: extra.privacyPolicyUrl }]];
}

const MILLISECONDS_PER_MINUTE = 60_000;

function versionCodeOf(environment: z.infer<typeof BUILD_ENVIRONMENT>): number {
  return environment.ANDROID_VERSION_CODE ?? Math.floor(Date.now() / MILLISECONDS_PER_MINUTE);
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
  const config: ExpoConfig = {
    name: 'SmartEverything',
    slug: 'smarteverything',
    version: APP_VERSION,
    scheme: 'smarteverything',
    orientation: 'default',
    userInterfaceStyle: 'dark',
    backgroundColor: '#0A0A0C',
    experiments: { typedRoutes: true, reactCompiler: true },
    plugins: [
      'expo-router',
      WEBRTC_PLUGIN,
      ['expo-build-properties', ANDROID_BUILD_PROPERTIES],
      ['expo-notifications', { color: '#F2B45E', icon: './assets/notification-icon.png' }],
      SPLASH_PLUGIN,
      CAMERA_PLUGIN,
      ['expo-font', { fonts: FONT_FILES }],
      'expo-secure-store',
      LOCATION_PLUGIN,
      './plugins/accumulated-updates/app.plugin.js',
      ['./plugins/android-build/app.plugin.js', { variant: environment.ANDROID_VARIANT }],
      ...healthConnectPlugins(extra),
    ],
    icon: './assets/icon.png',
    web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
    android: {
      package: APPLICATION_ID,
      versionCode: versionCodeOf(environment),
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-foreground.png',
        monochromeImage: './assets/adaptive-monochrome.png',
        backgroundColor: '#0E0E10',
      },
    },
    runtimeVersion: { policy: 'appVersion' },
    updates: { enabled: false },
    extra,
  };
  return extra.privacyPolicyUrl === null ? withMissingPrivacyPolicy(config) : config;
};
