import { hoursMinutes } from '../../../format/time';
import { bytes } from '../../../format/number';
import { CONTEXT_TEXT } from '../phone-context-text';
import type { PhoneReadings } from '../phone-values';
import type { PhoneSectionId } from './sections';

const RINGER_TEXT = { normal: 'Normal', vibrate: 'Vibrate', silent: 'Silent' } as const;

export type RailReadings = Pick<
  PhoneReadings,
  | 'battery'
  | 'charging'
  | 'dnd'
  | 'doing'
  | 'network'
  | 'notificationCount'
  | 'ringerMode'
  | 'screenMinutes'
  | 'storageFree'
>;

export function railReadingsOf(readings: PhoneReadings): RailReadings {
  return {
    battery: readings.battery,
    charging: readings.charging,
    dnd: readings.dnd,
    doing: readings.doing,
    network: readings.network,
    notificationCount: readings.notificationCount,
    ringerMode: readings.ringerMode,
    screenMinutes: readings.screenMinutes,
    storageFree: readings.storageFree,
  };
}

function soundSummary(readings: RailReadings): string | null {
  if (readings.dnd === true) return 'Do not disturb';
  return readings.ringerMode === null ? null : RINGER_TEXT[readings.ringerMode];
}

function batterySummary(readings: RailReadings): string | null {
  if (readings.battery === null) return null;
  return `${String(readings.battery)} %${readings.charging ? ' · charging' : ''}`;
}

function screenSummary(readings: RailReadings): string | null {
  return readings.screenMinutes === null ? null : hoursMinutes(readings.screenMinutes);
}

function storageSummary(readings: RailReadings): string | null {
  return readings.storageFree === null ? null : `${bytes(readings.storageFree)} free`;
}

function notificationsSummary(readings: RailReadings): string | null {
  return readings.notificationCount === null ? null : String(readings.notificationCount);
}

function activitySummary(readings: RailReadings): string | null {
  return readings.doing === null ? null : CONTEXT_TEXT[readings.doing.state];
}

const SUMMARY: Readonly<Record<PhoneSectionId, (readings: RailReadings) => string | null>> = {
  overview: () => null,
  battery: batterySummary,
  sound: soundSummary,
  screen: screenSummary,
  network: (readings) => readings.network,
  storage: storageSummary,
  apps: () => null,
  notifications: notificationsSummary,
  activity: activitySummary,
  setup: () => null,
};

export function railSummaryOf(id: PhoneSectionId, readings: RailReadings): string | null {
  return SUMMARY[id](readings);
}
