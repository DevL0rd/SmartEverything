export { TUYA_ENDPOINTS } from './regions';
export type { RegionEndpoints, TuyaRegion } from './regions';

export {
  HTTP_METHODS,
  SIGN_METHOD,
  canonicalUrl,
  contentSha256,
  sign,
  signedHeaders,
  stringToSign,
} from './signing';
export type { CloudRequest, HttpMethod, SigningInput } from './signing';

export {
  TUYA_ERROR_KINDS,
  TuyaCloudError,
  TuyaResponseError,
  errorKindOf,
  readEnvelope,
} from './envelope';
export type { TuyaErrorCode, TuyaErrorKind } from './envelope';

export {
  TOKEN_PATH,
  TOKEN_QUERY,
  TOKEN_REFRESH_MARGIN_MS,
  TOKEN_RESULT,
  needsRefresh,
  refreshPath,
  tokenFrom,
} from './token';
export type { CloudToken } from './token';

export {
  CLOUD_DEVICE,
  CLOUD_PATHS,
  COMMAND_ACCEPTED,
  DEVICE_PAGE,
  DEVICE_PAGE_SIZE,
  DEVICE_STATUSES,
  HOMES,
  IR_LEARNED,
  IR_REMOTES,
  IR_REMOTE_KEYS,
  ROOMS,
  ROOM_DEVICES,
  SPECIFICATION,
  STATUS_BATCH_SIZE,
  commandBody,
  commandsOf,
  deviceListQuery,
} from './cloud-api';
export type { CloudDevice, IrRemote, IrRemoteKeys, Specification, StatusItem } from './cloud-api';

export { TUYA_JSON_MAX_LENGTH, TUYA_TEXT_MAX_LENGTH, dataPointsOf } from './data-points';
export type {
  DataPoint,
  DataPointShape,
  DataPoints,
  PointSource,
  PointSources,
  RejectedDataPoint,
} from './data-points';

export {
  DataPointValueError,
  descriptorOf,
  fromDevice,
  scaled,
  toDevice,
  unscaled,
} from './values';
export type { DeviceValue } from './values';

export { ColorValueError, decodeColor, encodeColor } from './color';
export type { ColorVersion, Transport } from './color';

export { IR_REMOTE_CATEGORY_PREFIX, kindOf } from './categories';

export { CAPABILITY_RULES } from './capability-rules';
export type { CapabilityRule, Codec } from './capability-rules';

export {
  IR_CAPABILITIES,
  buildDeviceModel,
  decodeReport,
  encodeCommand,
  reportFromDps,
} from './model';
export type {
  CapabilityBinding,
  DecodeProblem,
  DecodedReport,
  DecodedValue,
  DeviceModel,
  ReportedValue,
} from './model';

export {
  HEAD_KEY,
  IR_CODE,
  IR_CODE_FORMATS,
  IrCodeError,
  LIBRARY_KEY,
  MAX_PULSE_MICROSECONDS,
  canonicalIrCode,
  headKeyToPulses,
  learnedCodeFromHex,
  parseHeadKey,
  parseLibraryKey,
  pulsesFromBase64,
  pulsesFromHex,
  pulsesToBase64,
  pulsesToHex,
} from './ir-codes';
export type { HeadKey, IrCode, IrCodeFormat, LibraryKey } from './ir-codes';

export { irSchemeOf, irWrites, learnedCode } from './ir-scheme';
export type { DataPointRef, DataPointWrite, IrAction, IrScheme } from './ir-scheme';

export { eventsOf } from './events';

export {
  DISCOVERY_PORTS,
  LanAnnouncementError,
  UDP_KEY,
  readLanAnnouncement,
} from './lan-discovery';
export type { LanAnnouncement } from './lan-discovery';

export {
  CloudMessageError,
  INVENTORY_BIZ_CODES,
  MESSAGE_ACK_TIMEOUT_MS,
  MESSAGE_TOPIC,
  acknowledgement,
  messageConsumerUrl,
  messagePassword,
  readMessageFrame,
} from './messages';
export type { CloudMessage, MessageFrame } from './messages';

export {
  LOCAL_KEY_LENGTH,
  classifyLocalPayload,
  isKeyMismatchError,
  isUsableLocalKey,
} from './local-payload';
export type { LocalPayload } from './local-payload';

export {
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  TRANSPORT_REASONS,
  chooseTransport,
  reconnectDelay,
} from './transport';
export type { TransportChoice, TransportFacts, TransportReason } from './transport';

export {
  MANUFACTURER,
  RemoteKeyError,
  discoveredDevice,
  isSleepingSensor,
  libraryCommandBody,
  libraryKeyOf,
  remoteDevice,
  remoteKeyCapability,
} from './inventory';
export type { InventoryEntry } from './inventory';

export {
  SMART_LIFE_CLIENT_ID,
  SMART_LIFE_LOGIN_HOST,
  SMART_LIFE_QR_PREFIX,
  SMART_LIFE_SCAN_PENDING,
  SMART_LIFE_SCHEMA,
  loginResultUrl,
  qrContent,
  qrTokenUrl,
  readLoginReply,
  readQrToken,
} from './smart-life-login';
export type { LoginReply, SmartLifeSession } from './smart-life-login';

export { SmartLifeCryptoError, SMART_LIFE_NONCE_LENGTH } from './smart-life-crypto';

export {
  ANY_RESULT,
  CUSTOM_TYPE,
  DATA_POINT_RELATIONS,
  SMART_LIFE_DEVICES,
  SMART_LIFE_HOMES,
  SMART_LIFE_MESSAGING,
  SMART_LIFE_PATHS,
  SMART_LIFE_ROOM,
  SMART_LIFE_SPECIFICATION,
  SMART_LIFE_TOKEN,
  readSealedReply,
  sealRequest,
} from './smart-life-api';
export type {
  SealedReply,
  SealedRequest,
  SmartLifeCall,
  SmartLifeDevice,
  SmartLifeEntropy,
  SmartLifeMessaging,
} from './smart-life-api';

export { CLOUD_REPORT_REASONS, isLanWritable, smartLifeModel } from './smart-life-model';
export type {
  CloudReportReason,
  CloudReports,
  GatewaySource,
  NodeIdSource,
  SmartLifeFacts,
  SmartLifeModel,
} from './smart-life-model';

export { ConversionError, convertDataPoints, convertValue, isKnownConversion } from './conversions';
export type { ConvertedReport, DataPointConversion } from './conversions';

export { deviceTopic, ownerTopic, readSmartLifeMessage } from './smart-life-messages';
