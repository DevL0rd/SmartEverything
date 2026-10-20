export const USER_CODE = 'EU1a2B3c';

export const ENDPOINT = 'https://openapi.eu.example.test';

export const HOME_ID = '4200001';

export const QR_TOKEN_REPLY = {
  success: true,
  result: { qrcode: 'qr-token-0001' },
  t: 1_760_000_000_000,
} as const;

export const SCAN_PENDING_REPLY = {
  success: false,
  code: 'E0020003',
  msg: 'the QR code has not been confirmed yet',
  t: 1_760_000_001_000,
} as const;

export const USER_CODE_REFUSED_REPLY = {
  success: false,
  code: 1004,
  msg: 'the user code is not valid',
  t: 1_760_000_000_000,
} as const;

export const SESSION_ENDED_REPLY = {
  success: false,
  code: 1010,
  msg: 'token invalid',
  t: 1_760_000_000_000,
} as const;

export const TOKEN_LIFETIME_SECONDS = 7200;

export const SIGNED_IN_RESULT = {
  terminal_id: 'terminal-0001',
  endpoint: ENDPOINT,
  uid: 'ay1760000000000abcde',
  username: 'eu-1760000000',
} as const;

export const HOMES_RESULT = [{ ownerId: HOME_ID, name: 'Home' }] as const;

export interface RecordedPoint {
  readonly code: string;
  readonly dpId: number;
  readonly type: string;
  readonly values: object;
}

export const S06_CATEGORY = 'wnykq';

export const S06_POINTS: readonly RecordedPoint[] = [
  {
    code: 'control',
    dpId: 1,
    type: 'Enum',
    values: { range: ['study', 'send_ir', 'study_exit', 'delete_study_code'] },
  },
  { code: 'study_code', dpId: 2, type: 'Raw', values: { maxlen: 128 } },
  { code: 'ir_code', dpId: 3, type: 'Raw', values: { maxlen: 128 } },
  { code: 'key_code', dpId: 4, type: 'Raw', values: { maxlen: 128 } },
  { code: 'key_study', dpId: 7, type: 'Raw', values: { maxlen: 128 } },
  { code: 'type', dpId: 13, type: 'Integer', values: { min: 0, max: 3, scale: 0, step: 1 } },
  {
    code: 'va_temperature',
    dpId: 18,
    type: 'Integer',
    values: { unit: '℃', min: -200, max: 600, scale: 1, step: 1 },
  },
  {
    code: 'va_humidity',
    dpId: 19,
    type: 'Integer',
    values: { unit: '%', min: 0, max: 100, scale: 0, step: 1 },
  },
];

export const READ_ONLY_CODES: ReadonlySet<string> = new Set([
  'study_code',
  'va_temperature',
  'va_humidity',
]);

export const WRITE_ONLY_CODES: ReadonlySet<string> = new Set([
  'ir_code',
  'key_code',
  'key_study',
  'type',
]);
