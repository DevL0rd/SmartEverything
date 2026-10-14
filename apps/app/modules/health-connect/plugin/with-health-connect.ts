import type { HealthRecordType } from '@smarteverything/domain';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AndroidConfig,
  type ConfigPlugin,
  type ExportedConfigWithProps,
  withAndroidManifest,
  withDangerousMod,
  type AndroidManifest,
} from 'expo/config-plugins.js';

export interface HealthConnectPluginOptions {
  readonly privacyPolicyUrl: string;
}

const PREFIX = 'android.permission.health.';

const READ_PERMISSION_OF: Readonly<Record<HealthRecordType, string>> = {
  ActiveCaloriesBurned: 'READ_ACTIVE_CALORIES_BURNED',
  BasalBodyTemperature: 'READ_BASAL_BODY_TEMPERATURE',
  BasalMetabolicRate: 'READ_BASAL_METABOLIC_RATE',
  BloodGlucose: 'READ_BLOOD_GLUCOSE',
  BloodPressure: 'READ_BLOOD_PRESSURE',
  BodyFat: 'READ_BODY_FAT',
  BodyTemperature: 'READ_BODY_TEMPERATURE',
  BodyWaterMass: 'READ_BODY_WATER_MASS',
  BoneMass: 'READ_BONE_MASS',
  CervicalMucus: 'READ_CERVICAL_MUCUS',
  CyclingPedalingCadence: 'READ_EXERCISE',
  Distance: 'READ_DISTANCE',
  ElevationGained: 'READ_ELEVATION_GAINED',
  ExerciseSession: 'READ_EXERCISE',
  FloorsClimbed: 'READ_FLOORS_CLIMBED',
  HeartRate: 'READ_HEART_RATE',
  HeartRateVariabilityRmssd: 'READ_HEART_RATE_VARIABILITY',
  Height: 'READ_HEIGHT',
  Hydration: 'READ_HYDRATION',
  IntermenstrualBleeding: 'READ_INTERMENSTRUAL_BLEEDING',
  LeanBodyMass: 'READ_LEAN_BODY_MASS',
  MenstruationFlow: 'READ_MENSTRUATION',
  MenstruationPeriod: 'READ_MENSTRUATION',
  MindfulnessSession: 'READ_MINDFULNESS',
  Nutrition: 'READ_NUTRITION',
  OvulationTest: 'READ_OVULATION_TEST',
  OxygenSaturation: 'READ_OXYGEN_SATURATION',
  PlannedExerciseSession: 'READ_PLANNED_EXERCISE',
  Power: 'READ_POWER',
  RespiratoryRate: 'READ_RESPIRATORY_RATE',
  RestingHeartRate: 'READ_RESTING_HEART_RATE',
  SexualActivity: 'READ_SEXUAL_ACTIVITY',
  SkinTemperature: 'READ_SKIN_TEMPERATURE',
  SleepSession: 'READ_SLEEP',
  Speed: 'READ_SPEED',
  Steps: 'READ_STEPS',
  StepsCadence: 'READ_STEPS',
  TotalCaloriesBurned: 'READ_TOTAL_CALORIES_BURNED',
  Vo2Max: 'READ_VO2_MAX',
  Weight: 'READ_WEIGHT',
  WheelchairPushes: 'READ_WHEELCHAIR_PUSHES',
};

const ACCESS_PERMISSIONS = ['READ_HEALTH_DATA_IN_BACKGROUND', 'READ_HEALTH_DATA_HISTORY'];

const WRITE_PERMISSIONS = Object.values(READ_PERMISSION_OF).map((name) =>
  name.replace(/^READ_/, 'WRITE_'),
);

export const HEALTH_CONNECT_PERMISSIONS: readonly string[] = [
  ...new Set([...Object.values(READ_PERMISSION_OF), ...ACCESS_PERMISSIONS, ...WRITE_PERMISSIONS]),
].map((name) => PREFIX + name);

const HEALTH_CONNECT_PACKAGE = 'com.google.android.apps.healthdata';
const RATIONALE_ACTIVITY = 'expo.modules.healthconnect.PermissionsRationaleActivity';
const RATIONALE_ALIAS = 'expo.modules.healthconnect.ViewPermissionUsageActivity';
const PRIVACY_POLICY_KEY = 'expo.modules.healthconnect.PRIVACY_POLICY_URL';

export class HealthConnectPluginError extends Error {
  override readonly name = 'HealthConnectPluginError';
  readonly received: string;

  constructor(received: string) {
    super(
      `The health-connect config plugin needs privacyPolicyUrl, an https URL Health Connect ` +
        `shows as the permissions rationale; received "${received}"`,
    );
    this.received = received;
  }
}

function privacyPolicyOf(options: HealthConnectPluginOptions | undefined): string {
  const url = options?.privacyPolicyUrl ?? '';
  if (!URL.canParse(url) || new URL(url).protocol !== 'https:') {
    throw new HealthConnectPluginError(url);
  }
  return url;
}

function withoutNamed<T extends { $?: { 'android:name': string } }>(
  items: readonly T[] | undefined,
  name: string,
): T[] {
  return (items ?? []).filter((item) => item.$?.['android:name'] !== name);
}

function addQueries(manifest: AndroidManifest): void {
  const queries = manifest.manifest.queries;
  const listed = queries.some((query) =>
    (query.package ?? []).some((entry) => entry.$['android:name'] === HEALTH_CONNECT_PACKAGE),
  );
  if (!listed) {
    queries.push({ package: [{ $: { 'android:name': HEALTH_CONNECT_PACKAGE } }] });
  }
}

function addRationale(manifest: AndroidManifest, privacyPolicyUrl: string): void {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.activity = [
    ...withoutNamed(application.activity, RATIONALE_ACTIVITY),
    {
      $: { 'android:name': RATIONALE_ACTIVITY, 'android:exported': 'true' },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
        },
      ],
    },
  ];
  application['activity-alias'] = [
    ...withoutNamed(application['activity-alias'], RATIONALE_ALIAS),
    {
      $: {
        'android:name': RATIONALE_ALIAS,
        'android:exported': 'true',
        'android:targetActivity': RATIONALE_ACTIVITY,
        'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        },
      ],
    },
  ];
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(
    application,
    PRIVACY_POLICY_KEY,
    privacyPolicyUrl,
  );
}

const PICTURE_IN_PICTURE_CONFIG_CHANGES = [
  'screenSize',
  'smallestScreenSize',
  'screenLayout',
  'orientation',
];

function allowPictureInPicture(manifest: AndroidManifest): void {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  activity.$['android:supportsPictureInPicture'] = 'true';
  const present = (activity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
  const missing = PICTURE_IN_PICTURE_CONFIG_CHANGES.filter((change) => !present.includes(change));
  activity.$['android:configChanges'] = [...present, ...missing].join('|');
}

const NETWORK_SECURITY = '@xml/hub_resource_network_security';
const NETWORK_SECURITY_FILE = 'hub_resource_network_security.xml';
const DEVELOPMENT_VARIANTS = ['debug', 'debugOptimized'] as const;
const DEVELOPMENT_NETWORK_SECURITY = new URL(
  '../android/src/debug/res/xml/hub_resource_network_security.xml',
  import.meta.url,
);

const withHubResourceDevelopmentPolicy: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    'android',
    async (modified): Promise<ExportedConfigWithProps<unknown>> => {
      const template = await readFile(DEVELOPMENT_NETWORK_SECURITY, 'utf8');
      for (const variant of DEVELOPMENT_VARIANTS) {
        const directory = join(
          modified.modRequest.platformProjectRoot,
          'app',
          'src',
          variant,
          'res',
          'xml',
        );
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, NETWORK_SECURITY_FILE), template);
      }
      return modified;
    },
  ]);

function addHubResourceManifest(manifest: AndroidManifest): void {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const existingSecurity = application.$['android:networkSecurityConfig'];
  if (existingSecurity !== undefined && existingSecurity !== NETWORK_SECURITY) {
    throw new Error(
      'Merge the existing Android network security policy before enabling hub resources.',
    );
  }
  application.$['android:networkSecurityConfig'] = NETWORK_SECURITY;
}

type ManifestConfig = Parameters<Parameters<typeof withAndroidManifest>[1]>[0];

function manifestEdit(privacyPolicyUrl: string): (modified: ManifestConfig) => ManifestConfig {
  return (modified) => {
    addQueries(modified.modResults);
    addRationale(modified.modResults, privacyPolicyUrl);
    allowPictureInPicture(modified.modResults);
    addHubResourceManifest(modified.modResults);
    return modified;
  };
}

export const withHealthConnect: ConfigPlugin<HealthConnectPluginOptions> = (config, options) => {
  const privacyPolicyUrl = privacyPolicyOf(options);
  const permitted = AndroidConfig.Permissions.withPermissions(config, [
    ...HEALTH_CONNECT_PERMISSIONS,
  ]);
  const developmentPolicy = withHubResourceDevelopmentPolicy(permitted);
  return withAndroidManifest(developmentPolicy, manifestEdit(privacyPolicyUrl));
};
