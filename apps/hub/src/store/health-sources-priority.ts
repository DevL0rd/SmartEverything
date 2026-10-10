import { OWN_SOURCE_PREFIX, isOwnSource, type HealthRecord } from '@smarteverything/domain';

const WEARABLE_APPS: readonly string[] = [
  'nodomain.freeyourgadget.gadgetbridge',
  'com.xiaomi.wearable',
  'com.mi.health',
  'com.fitbit.FitbitMobile',
  'com.garmin.android.apps.connectmobile',
  'com.huawei.health',
  'com.samsung.android.wear.shealth',
];

const PHONE_SENSOR_PREFIXES: readonly string[] = ['com.android.healthconnect.phone', 'android'];

function groupOf(sourceApp: string): string {
  return isOwnSource(sourceApp) ? OWN_SOURCE_PREFIX : sourceApp;
}

function rankOf(group: string): number {
  if (group === OWN_SOURCE_PREFIX) {
    return 0;
  }
  const wearable = WEARABLE_APPS.indexOf(group);
  if (wearable >= 0) {
    return 1 + wearable;
  }
  const phone = PHONE_SENSOR_PREFIXES.some(
    (prefix) => group === prefix || group.startsWith(`${prefix}.`),
  );
  return phone ? 1000 : 100;
}

function preferredGroup(records: readonly HealthRecord[]): string | null {
  const groups = [...new Set(records.map((record) => groupOf(record.sourceApp)))];
  groups.sort((left, right) => rankOf(left) - rankOf(right) || left.localeCompare(right));
  return groups[0] ?? null;
}

export function fromPreferredSource<T extends HealthRecord>(records: readonly T[]): T[] {
  const group = preferredGroup(records);
  return records.filter((record) => groupOf(record.sourceApp) === group);
}
