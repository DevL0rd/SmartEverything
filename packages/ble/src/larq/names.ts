export const READ_REQUESTS = [
  'RequestGetCapUiState',
  'RequestGetCapTimeSettings',
  'RequestGetCapTofState',
  'RequestGetCapTofSettings',
  'RequestGetCapTofLog',
  'RequestGetCapActivationLog',
  'RequestGetCapStateLog',
  'RequestGetCapFaultLog',
  'RequestGetActivationCapAdcLog',
  'RequestGetChargingCapAdcLog',
  'RequestGetCapAccelerometerState',
  'RequestGetCapAmbientLightSensorState',
  'RequestGetCapHallEffectSensorState',
  'RequestGetCapSipSensorState',
  'RequestGetCapBottleSensorState',
  'RequestGetCapHydroReminderSettings',
  'RequestGetCapDoNotDisturbSettings',
  'RequestGetCapLowBatterySettings',
  'RequestGetCapUvConfig',
  'RequestGetCapStateThresholdSettings',
  'RequestGetCapAdcProtectionSettings',
  'RequestGetCapCalibrationSettings',
] as const;

export const WRITE_REQUESTS = [
  'RequestSetCapTimeSettings',
  'RequestSetCapHydroReminderSettings',
  'RequestSetCapDoNotDisturbSettings',
  'RequestSetCapUvActivate',
] as const;

export const ALLOWED_REQUESTS = [...READ_REQUESTS, ...WRITE_REQUESTS] as const;

export type RequestName = (typeof ALLOWED_REQUESTS)[number];

export const NEVER_SENT_REQUESTS = [
  'RequestSetCapUvConfig',
  'RequestSetCapStateThresholdSettings',
  'RequestSetCapAdcProtectionSettings',
  'RequestSetCapLowBatterySettings',
  'RequestSetCapTofSettings',
  'RequestSetCapCalibrationSettings',
  'RequestCapStartCapCalibration',
  'RequestCapStopCapCalibration',
  'RequestCapEnterLowBatteryMode',
  'RequestCapEnterDfuMode',
  'RequestCapFactoryReset',
  'RequestSetCapBottleSensorState',
  'RequestSetCapPowerSavingMode',
] as const;

const ALLOWED: ReadonlySet<string> = new Set(ALLOWED_REQUESTS);

export function isAllowedRequest(name: string): name is RequestName {
  return ALLOWED.has(name);
}

export const REQUEST_PREFIX = 'Request';

export const RESPONSE_PREFIX = 'Response';

export function responseNameOf(request: RequestName): string {
  return `${RESPONSE_PREFIX}${request.slice(REQUEST_PREFIX.length)}`;
}
