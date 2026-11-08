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
  MapBlobError,
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

export { inputShapeOf, modelFromSpec, propertyKeyOf } from './device-model';
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
  unspecifiedMiotEvent,
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

export { cameraFeatures, DEFAULT_CAMERA_TRANSPORT, go2rtcSource, isCameraModel } from './camera';
export type { CameraTransport } from './camera';
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

export {
  GRID_FIRST_ROOM,
  GRID_LAST_ROOM,
  cellToMillimetres,
  decodeMapLayer,
  decodeTrajectory,
  decryptMapBlob,
  mapKey,
  millimetresToCell,
  roomCellCounts,
} from './vacuum/map-blob';
export type { MapLayer } from './vacuum/map-blob';
export { MAP_DOCUMENT, MAP_ENVELOPE } from './vacuum/map-document';
export type { MapDocument, TrajectoryPoint } from './vacuum/map-document';

export {
  VACUUM_SERVICE_ID,
  VacuumCatalogError,
  findAction,
  findEvent,
  findProperty,
  isAbsentOnDevice,
  pv11glCatalog,
  vacuumAction,
  vacuumEvent,
  vacuumFault,
  vacuumFaultTable,
  vacuumProperty,
  vacuumStatus,
  vacuumStatusTable,
} from './vacuum/pv11gl-catalog';
export type { VacuumServiceKey, VacuumStatusEntry } from './vacuum/pv11gl-catalog';
export {
  VACUUM_ACTION,
  VACUUM_CATALOG,
  VACUUM_EVENT,
  VACUUM_FAULT,
  VACUUM_FAULT_TABLE,
  VACUUM_PROPERTY,
  VACUUM_SAFETY,
  VACUUM_SERVICE,
} from './vacuum/catalog-schema';
export type {
  VacuumAction,
  VacuumCatalog,
  VacuumEvent,
  VacuumFault,
  VacuumProperty,
  VacuumSafety,
  VacuumService,
} from './vacuum/catalog-schema';
export { actionSafety, propertySafety, vacuumSafety } from './vacuum/pv11gl-safety';
export {
  STATION_MODES,
  vacuumConsumables,
  vacuumStationFunctions,
  vacuumStationMode,
} from './vacuum/pv11gl-station';
export type {
  ConsumableId,
  StationFunctionId,
  VacuumConsumable,
  VacuumStationFunction,
  VacuumStationMode,
} from './vacuum/pv11gl-station';

export { CELL_FLAG, dirtLevel, hasCellFlag } from './vacuum/map-blob';
export { MAP_PATHS, PATH_POINT } from './vacuum/map-document';
export type { MapPaths, PathPoint } from './vacuum/map-document';
export {
  ROUTE_ACTION,
  ROUTE_DELTA,
  decodeMapRoute,
  mergeRouteDelta,
  parseRouteDelta,
  routeDeltaInput,
} from './vacuum/route';
export type { ActionOutput, Route, RouteMerge, RouteMode, RoutePoint } from './vacuum/route';
export { VACUUM_EVENT_FAMILY, vacuumFaultEvent } from './events';

export {
  VacuumCodecError,
  decodeDndWindow,
  decodePreset,
  decodePresetLabels,
  decodeRestrictedAreas,
  decodeVirtualWalls,
  encodeDndWindow,
  encodePreset,
  encodeRestrictedAreas,
  encodeVirtualWalls,
} from './vacuum/codecs';
export type {
  DoNotDisturbWindow,
  RestrictedArea,
  RestrictedAreaDraft,
  VacuumPreset,
  VacuumPresetLabel,
  VirtualWall,
  VirtualWallDraft,
} from './vacuum/codecs';
export {
  COMMAND_BUDGET,
  FLOOR_MATERIAL,
  VacuumCommandError,
  ZONES_MAX,
  closeAlert,
  commandWire,
  findRobot,
  goToDock,
  pauseCleaning,
  resumeCleaning,
  roomFloor,
  roomVisibility,
  startHouse,
  startRooms,
  startZones,
  stationStart,
  stationStop,
  stopCleaning,
} from './vacuum/commands';
export type {
  FloorMaterial,
  StationStartId,
  StationStopId,
  VacuumActionCall,
  VacuumActionInput,
  VacuumBudget,
  VacuumCommand,
  VacuumExpectation,
  VacuumPushed,
  VacuumRunOptions,
  VacuumWire,
} from './vacuum/commands';
export {
  PRESETS_MAX,
  RESTRICTIONS_MAX,
  presetAdd,
  presetDelete,
  presetModify,
  presetStart,
  setRestrictions,
} from './vacuum/commands-saved';

export {
  buildVacuumScene,
  dockPose,
  robotPose,
  sceneBounds,
  toDockPoint,
  toDockPose,
} from './vacuum/scene';
export type { VacuumSceneSource } from './vacuum/scene';
export { buildRooms } from './vacuum/scene-rooms';

export {
  NO_PUSHED_MAP_OBJECTS,
  OPENING_KIND,
  WALL_KIND,
  WALL_LINE_TYPE,
  buildCarpets,
  buildDoors,
  buildFurniture,
  buildObjects,
  buildSills,
  buildWalls,
  buildWallsLayer,
  buildZones,
  decodeAiObjects,
  decodeFurniture,
  decodeHiddenZones,
  decodeSills,
} from './vacuum/scene-walls';
export type {
  AiObject,
  FurnitureItem,
  HiddenZone,
  PushedMapObjects,
  Sill,
  WallsLayer,
} from './vacuum/scene-walls';

export {
  TRAIL_GAP_MILLIMETRES,
  applyRoute,
  buildTrail,
  currentRoomId,
  roomAt,
  routePose,
} from './vacuum/scene-route';

export { actionInput } from './miot';
export type { ActionInputShape } from './miot';

export { XIAOMI_SMART_TOWER_FAN_2_MODEL } from './models/fan';
export { XIAOMI_AIR_PURIFIER_4_PRO_MODEL } from './models/purifier';
export { XIAOMI_CAMERA_083AE2_MODEL } from './models/camera';
export { MIJIA_EVAPORATIVE_HUMIDIFIER_PRO_MODEL } from './models/humidifier';
export { MIJIA_WASHER_DRYER_F29GL_MODEL } from './models/laundry';
export { XIAOMI_PV11GL_ROBOT_MODEL } from './models/vacuum';
export { XIAOMI_PV11GL_STATION_MODEL } from './models/vacuum-station';
export { XIAOMI_WIRELESS_SWITCH_ROUND_MODEL } from './models/button';
export { XIAOMI_SMART_SCENT_DIFFUSER_MODEL } from './models/diffuser';
export { XIAOMI_SMART_HOME_HUB_2_MODEL } from './models/gateway';
export { XIAOMI_WATCH_S5_46_MODEL } from './models/watch';
