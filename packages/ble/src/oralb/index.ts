export {
  OralbFrameError,
  OralbRefusedError,
  UnsupportedOralbProtocol,
  requireAtLeast as requireOralbAtLeast,
  requireLength as requireOralbLength,
} from './errors';
export {
  ORALB_COMPANY_ID,
  ORALB_KEY,
  ORALB_SCAN_MANUFACTURER,
  ORALB_SERVICE,
  oralbFullOf,
  oralbServiceOf,
  oralbShortOf,
  oralbUuid,
} from './uuids';
export { ORALB_FIRST_IO_PROTOCOL, ORALB_MODES, oralbModeName, requireIoProtocol } from './modes';
export {
  ORALB_HEAD_STATES,
  ORALB_PRESSURE_STATES,
  ORALB_STATES,
  oralbHeadStateName,
  oralbPressureName,
  oralbStateName,
} from './states';
export type { OralbDelta, OralbSector } from './delta';
export {
  ORALB_ADVERT_LENGTH,
  advertDelta,
  advertSector,
  decodeOralbAdvert,
  oralbAdvertDelta,
} from './advert';
export type { OralbAdvert } from './advert';
export {
  ORALB_DECODED_KEYS,
  decodeOralbBattery,
  decodeOralbButton,
  decodeOralbClock,
  decodeOralbDeviceInfo,
  decodeOralbFace,
  decodeOralbHead,
  decodeOralbMac,
  decodeOralbModeId,
  decodeOralbModeSlots,
  decodeOralbPacer,
  decodeOralbPacerConfig,
  decodeOralbPressure,
  decodeOralbRingColour,
  decodeOralbState,
  decodeOralbTimer,
  decodeOralbUser,
  decodeOralbValue,
  gattSector,
} from './gatt';
export {
  ORALB_SESSION_RECORD_LENGTH,
  decodeOralbRecord,
  isOralbMetadata,
  recordWallTime,
} from './record';
export type {
  OralbHeaderRecord,
  OralbMetadataRecord,
  OralbRecord,
  OralbRecordHeader,
  OralbSessionRecord,
} from './record';
export {
  ORALB_COLOUR_TOLERANCE,
  ORALB_NAMED_COLOURS,
  ORALB_WHITE_DRIVE,
  displayOfDrive,
  ringColourOf,
} from './ring';
export type { OralbColourName, OralbRgb, OralbRingColour } from './ring';
export {
  CONFIG_PREFIX,
  clockPayload,
  configWrite,
  extendConnection,
  headResetPayload,
  headSnoozePayload,
  metadataSelect,
  modeSlotsPayload,
  pacerPayload,
  readSelect,
  ringColourPayload,
} from './control';
export type { OralbConfigKey, OralbConfigWrite, OralbPrefixRule } from './control';
