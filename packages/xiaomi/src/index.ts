export {
  MIIO_PORT,
  decodeMessage,
  encodeMessage,
  helloPacket,
  parseHandshake,
  parseProbeReply,
  parseToken,
  probePacket,
} from './miio-packet';
export type { Handshake, MiioHeader, MiioMessage, ProbeReply, PushOffer } from './miio-packet';

export {
  SUBSCRIBE_METHOD,
  UNSUBSCRIBE_METHOD,
  checkSubscription,
  isUplink,
  needsSubscription,
  parseUplink,
  statusNoticeId,
  subscriptionParams,
  uplinkAck,
} from './push';
export type { LegacyChildEvent, MiotEventArgument, Uplink } from './push';

export { encodeRequest, nextMessageId, parseResponse, responseId } from './rpc';
export type { RpcRequest } from './rpc';

export {
  actionParams,
  checkPropertyWrites,
  getPropertiesParams,
  parseActionResult,
  parsePropertyReadings,
  setPropertiesParams,
} from './miot';
export type { ActionAddress, PropertyAddress, PropertyReading, PropertyWrite } from './miot';

export {
  MiioDeviceError,
  MiioPacketError,
  MiotRefusedError,
  MiotSpecError,
  MiotValueError,
  XiaomiCloudError,
  XiaomiLoginError,
} from './errors';

export { rc4Drop1024 } from './rc4';

export {
  HEALTH_HOST,
  HEALTH_SID,
  HEALTH_USER_AGENT,
  HealthSourceListError,
  SOURCE_LIST_PATH,
  clientSign,
  parseSourceList,
  rawNonceOf,
  sourceListData,
} from './health';
export type { SkippedSource, SourceList, Wearable } from './health';

export {
  apiBaseUrl,
  createNonce,
  decryptResponse,
  encryptRequest,
  regionalHost,
  signFields,
  signedNonce,
} from './cloud-signing';
export type { FormFields, HttpMethod, SignedRequest, XiaomiRegion } from './cloud-signing';

export { isSessionExpired, parseCloudEnvelope } from './cloud-envelope';
export type { CloudPayload } from './cloud-envelope';

export {
  ACCOUNT_BASE,
  XIAOMI_SID,
  absoluteAccountUrl,
  identityListUrl,
  parseIdentityList,
  parseLoginAuth,
  parseLoginJson,
  parseSendTicket,
  parseServiceLogin,
  parseVerifyTicket,
  passwordHash,
  verificationFlag,
} from './login';
export type {
  LoginAuthReply,
  LoginSession,
  LoginSign,
  SendTicketReply,
  ServiceLoginReply,
  VerificationMethod,
} from './login';

export { cookieHeader, mergeSetCookies, verificationDestination } from './login-cookies';
export type { CookieJar } from './login-cookies';

export {
  MIOT_ACTION,
  MIOT_EVENT,
  MIOT_FORMATS,
  MIOT_PROPERTY,
  MIOT_SERVICE,
  MIOT_SPEC,
  MIOT_SPEC_INDEX,
  deviceKindOf,
  parseUrn,
  readingsSourceOf,
  specTypeForModel,
  standardName,
} from './spec';
export type {
  MiotAction,
  MiotEvent,
  MiotFormat,
  MiotProperty,
  MiotService,
  MiotSpec,
  MiotSpecIndex,
  MiotUrn,
} from './spec';

export { TEXT_MAX_LENGTH, describeProperty, fromDevice, toDevice } from './miot-values';
export type { EnumOption, PropertyValue, ValueCodec } from './miot-values';

export { hsvToRgb, rgbToHsv } from './color';

export { modelFromSpec, propertyKeyOf } from './device-model';
export type {
  ActionBinding,
  ActionInput,
  Binding,
  DeviceModel,
  PropertyBinding,
} from './device-model';

export {
  CAMERA_EVENT_HOST,
  CAMERA_EVENT_PATH,
  callEventName,
  cameraEventDetections,
  cameraEventListData,
  deviceEventFromMiot,
  deviceEventFromLegacyButton,
  supportsLegacyButton,
  miotDetection,
  miotEventDetails,
  miotEventKind,
  miotEventOf,
  parseCameraEventPage,
} from './events';
export type {
  CameraEvent,
  CameraEventDetections,
  CameraEventPage,
  CameraEventQuery,
  MiotEventShape,
  ObservedEvent,
} from './events';

export {
  DEVICE_LIST_PATH,
  HOME_LIST_PATH,
  chooseTransport,
  deviceListData,
  homeListData,
  parseDeviceList,
  parseRoomNames,
} from './inventory';
export type { CloudDevice, DeviceListPage, Transport, TransportChoice } from './inventory';

export { cameraFeatures, go2rtcSource, isCameraModel } from './camera';
export type { CameraFeatures, Go2rtcCamera } from './camera';

export {
  MISS_MOTOR_PATH,
  MOTOR_METHOD,
  MOTOR_MODELS,
  MOTOR_OPERATIONS,
  NO_MOTOR,
  PTZ_DIRECTIONS,
  cloudRpc,
  describePtz,
  hasMotor,
  missUnreachable,
  parsePositions,
  positionsReading,
  presetWrite,
  ptzCapabilities,
  ptzPlan,
  ptzStep,
} from './ptz';
export type {
  MotorOperation,
  PresetSlots,
  PtzDirection,
  PtzMoves,
  PtzPlan,
  PtzPosition,
  PtzPositions,
  PtzStep,
} from './ptz';

export {
  BEACON_KEY_PATH,
  BeaconKeyMissingError,
  beaconKeyData,
  isBluetoothDid,
  parseBeaconKey,
} from './bluetooth';
