export const GROUP_TAG = {
  operation: 0x01,
  job: 0x02,
  end: 0x03,
  printer: 0x04,
  unsupported: 0x05,
  subscription: 0x06,
  eventNotification: 0x07,
  document: 0x09,
  system: 0x0a,
} as const;

export const VALUE_TAG = {
  unsupported: 0x10,
  unknown: 0x12,
  noValue: 0x13,
  integer: 0x21,
  boolean: 0x22,
  enum: 0x23,
  octetString: 0x30,
  dateTime: 0x31,
  resolution: 0x32,
  rangeOfInteger: 0x33,
  beginCollection: 0x34,
  textWithLanguage: 0x35,
  nameWithLanguage: 0x36,
  endCollection: 0x37,
  textWithoutLanguage: 0x41,
  nameWithoutLanguage: 0x42,
  keyword: 0x44,
  uri: 0x45,
  uriScheme: 0x46,
  charset: 0x47,
  naturalLanguage: 0x48,
  mimeMediaType: 0x49,
  memberAttrName: 0x4a,
} as const;

export const STRING_TAGS = {
  text: VALUE_TAG.textWithoutLanguage,
  name: VALUE_TAG.nameWithoutLanguage,
  keyword: VALUE_TAG.keyword,
  uri: VALUE_TAG.uri,
  uriScheme: VALUE_TAG.uriScheme,
  charset: VALUE_TAG.charset,
  naturalLanguage: VALUE_TAG.naturalLanguage,
  mimeMediaType: VALUE_TAG.mimeMediaType,
} as const;

export type StringKind = keyof typeof STRING_TAGS;

export const STRING_KIND_OF_TAG: ReadonlyMap<number, StringKind> = new Map<number, StringKind>([
  [STRING_TAGS.text, 'text'],
  [STRING_TAGS.name, 'name'],
  [STRING_TAGS.keyword, 'keyword'],
  [STRING_TAGS.uri, 'uri'],
  [STRING_TAGS.uriScheme, 'uriScheme'],
  [STRING_TAGS.charset, 'charset'],
  [STRING_TAGS.naturalLanguage, 'naturalLanguage'],
  [STRING_TAGS.mimeMediaType, 'mimeMediaType'],
]);

export const OUT_OF_BAND_TAGS = {
  unsupported: VALUE_TAG.unsupported,
  unknown: VALUE_TAG.unknown,
  'no-value': VALUE_TAG.noValue,
} as const;

export type OutOfBand = keyof typeof OUT_OF_BAND_TAGS;

export const OUT_OF_BAND_OF_TAG: ReadonlyMap<number, OutOfBand> = new Map<number, OutOfBand>([
  [VALUE_TAG.unsupported, 'unsupported'],
  [VALUE_TAG.unknown, 'unknown'],
  [VALUE_TAG.noValue, 'no-value'],
]);

export const RESOLUTION_UNITS = { dpi: 3, dpcm: 4 } as const;
