export {
  LarqCalibrationError,
  LarqFrameError,
  LarqIdentityError,
  LarqRefusedError,
  LarqResponseError,
} from './errors';
export {
  FAULT_TYPES,
  TOF_DISPLAY_MODES,
  TRIGGER_TYPES,
  UI_STATES,
  UV_LOG_MODES,
  nameOfCode,
} from './enums';
export type { UvCommand } from './enums';
export {
  CAP_RESPONSE,
  RESPONSE_CODES,
  TYPE_URL_PREFIX,
  decodeResponse,
  encodeRequest,
  expectAcknowledged,
  expectBody,
  requestIdOf,
  requestNameOfFrame,
} from './envelope';
export type { CapResponse, ResponseCode } from './envelope';
export {
  ALLOWED_REQUESTS,
  NEVER_SENT_REQUESTS,
  READ_REQUESTS,
  WRITE_REQUESTS,
  isAllowedRequest,
} from './names';
export type { RequestName } from './names';
export {
  LOG_REQUESTS,
  SECONDS_PER_DAY,
  logRequest,
  readRequest,
  setQuietRequest,
  setReminderRequest,
  setTimeRequest,
  uvRequest,
} from './requests';
export type { QuietWrite, ReadRequestName, ReminderColour, ReminderWrite } from './requests';
export {
  ACCELEROMETER,
  ADC_PROTECTION,
  CAPACITIVE_READING,
  HALL_READING,
  LOW_BATTERY_SETTINGS,
  QUIET_SETTINGS,
  REMINDER_SETTINGS,
  STATE_THRESHOLDS,
  TOF_SETTINGS,
  TOF_STATE,
  UI_STATE_READING,
  UV_CONFIG,
  decodeAccelerometer,
  decodeAdcProtection,
  decodeAmbientLight,
  decodeCalibrationSettings,
  decodeCapacitive,
  decodeHall,
  decodeLowBattery,
  decodeQuiet,
  decodeReminder,
  decodeStateThresholds,
  decodeTimeSettings,
  decodeTofSettings,
  decodeTofState,
  decodeUiState,
  decodeUvConfig,
} from './responses';
export type {
  Accelerometer,
  AdcProtection,
  CapacitiveReading,
  QuietSettings,
  ReminderSettings,
  StateThresholds,
  TofSettings,
  TofState,
  UiStateReading,
  UvConfig,
} from './responses';
export { decodeLogPage, nextLogCursor, scanLogPage } from './logs';
export type { LogPageScan, LogRows } from './logs';
export { DEVICE_INFORMATION_SERVICE, isLarqAdvert, serialOfName } from './identity';
export type { LarqAdvert } from './identity';
export { CURVES, curveFor, fitCalibration, volumeOf } from './volume';
export type { CalibrationFit, CurveId, VolumeCurve } from './volume';
export {
  EMPTY_CLASSIFIER,
  SIGNAL_ACCEPTABLE_KCPS,
  SIGNAL_GOOD_KCPS,
  classifyReadings,
  signalQualityOf,
} from './classify';
export type {
  Classification,
  ClassifiedRow,
  ClassifierRow,
  ReadingEvent,
  SignalQuality,
} from './classify';
export { ORIENTATION_TOLERANCE_G, gateAllows, isStill, orientationOf } from './orientation';
export {
  concatBytes,
  encodeBytes,
  encodeFixed32,
  encodeFloat,
  encodeMessage,
  encodeString,
  encodeVarint,
} from './wire';
export { fieldsOf, readBytes, readFixed32, readMessage, readVarint } from './wire';
