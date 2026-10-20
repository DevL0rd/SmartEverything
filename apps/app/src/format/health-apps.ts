import { titleCase } from './text';

const KNOWN_APPS: Readonly<Record<string, string>> = {
  'smarteverything.scale': 'Scale',
  'smarteverything.entries': 'Logged here',
  'smarteverything.larq': 'Bottle',
  'smarteverything.watch': 'Watch',
  'com.mi.health': 'Mi Fitness',
  'com.xiaomi.wearable': 'Mi Fitness',
  'com.xiaomi.hm.health': 'Zepp Life',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.google.android.apps.healthdata': 'Health Connect',
  'com.samsung.android.wear.shealth': 'Samsung Health',
  'com.sec.android.app.shealth': 'Samsung Health',
  'nodomain.freeyourgadget.gadgetbridge': 'Gadgetbridge',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.strava': 'Strava',
  'com.withings.wiscale2': 'Withings',
  'com.ouraring.oura': 'Oura',
  'com.myfitnesspal.android': 'MyFitnessPal',
  'com.polar.polarflow': 'Polar Flow',
  'com.whoop.android': 'Whoop',
};

const PHONE_PREFIX = 'com.android.healthconnect.phone';

const OWN_PREFIX = 'smarteverything.';

const GENERIC = new Set([
  'com',
  'org',
  'net',
  'io',
  'android',
  'app',
  'apps',
  'mobile',
  'health',
  'google',
  'www',
]);

function meaningful(segment: string): boolean {
  return !GENERIC.has(segment.toLowerCase()) && /^[a-zA-Z][a-zA-Z]{1,15}$/.test(segment);
}

export function appName(packageName: string): string {
  const known = KNOWN_APPS[packageName];
  if (known !== undefined) {
    return known;
  }
  if (packageName.startsWith(PHONE_PREFIX)) {
    return 'Your phone';
  }
  if (packageName.startsWith(OWN_PREFIX)) {
    return 'SmartEverything';
  }
  const segment = packageName.split('.').find(meaningful);
  return segment === undefined ? 'Another app' : titleCase(segment);
}
