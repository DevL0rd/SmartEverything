export {
  ForbiddenFrameError,
  FtmsFrameError,
  UnknownTreadmillFamilyError,
  UnsupportedCommandError,
  VendorFrameError,
  WilinkFrameError,
} from './errors';
export { FAULT_CODES, faultOf } from './faults';
export type { TreadmillFault } from './faults';
export { SCAN_NAME_PREFIXES, SCAN_SERVICES, familyOf, isTreadmillAdvert } from './family';
export { assertSendable } from './forbidden';
export {
  FTMS_CONTROL_POINT,
  FTMS_FEATURE,
  FTMS_INCLINE_RANGE,
  FTMS_MACHINE_STATUS,
  FTMS_SERVICE,
  FTMS_SPEED_RANGE,
  FTMS_TRAINING_STATUS,
  FTMS_TREADMILL_DATA,
  parseControlResponse,
  parseFeatures,
  parseInclineRange,
  parseMachineStatus,
  parseSpeedRange,
  parseTrainingStatus,
  parseTreadmillData,
  requestControl,
  targetInclination,
} from './ftms';
export type { ControlResponse, FtmsFeatures, FtmsRange } from './ftms';
export { linkPlanParts } from './link-plan';
export type { LinkPlanParts } from './link-plan';
export { WILINK_MODE_TO_START_MS, beltSteps, padSteps, stepOf } from './commands';
export type { BeltAction, ControlTarget, PadWrite } from './commands';
export {
  ODM_CHARACTERISTIC,
  SUPPLEMENT_NOTIFY,
  SUPPLEMENT_SERVICE,
  SUPPLEMENT_WRITE,
  decodeSupplement,
  emptySupplementState,
  settingGetFrame,
  supplementStateOf,
} from './vendor';
export type {
  SupplementDecoded,
  SupplementMode,
  SupplementProperty,
  SupplementState,
} from './vendor';
export {
  WILINK_NOTIFY,
  WILINK_SERVICE,
  WILINK_WRITE,
  decodeWilink,
  queryLatestRecordFrame,
  queryPreferencesFrame,
  splitWilink,
  statusRequest,
  wilinkChecksum,
} from './wilink';
export type { PadRecord, Split, UnknownByte, WilinkDecoded } from './wilink';
export { identityOf } from './identity';
