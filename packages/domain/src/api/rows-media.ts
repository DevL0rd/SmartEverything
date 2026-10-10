import { z } from 'zod';
import {
  COUNT,
  FLAG,
  ID,
  JSON_LIST,
  JSON_OBJECT,
  MOMENT,
  POSITION,
  boundedText,
} from './primitives';

export const CAMERA_ROW = z.strictObject({
  device_id: ID,
  stream_name: z.string().min(1),
  source_url_kind: z.string().min(1),
  physical_ptz: FLAG,
  two_way_audio: FLAG,
  record_events: FLAG,
});

export type CameraRow = z.infer<typeof CAMERA_ROW>;

export const RECORDING_KINDS = ['snapshot', 'clip'] as const;

export const RECORDING_KIND = z.enum(RECORDING_KINDS);

export type RecordingKind = z.infer<typeof RECORDING_KIND>;

export const RECORDING_ROW = z.strictObject({
  id: ID,
  device_id: ID,
  event_id: ID.nullable(),
  kind: RECORDING_KIND,
  storage_path: z.string().min(1),
  started_at: MOMENT,
  duration_ms: COUNT.nullable(),
  bytes: COUNT,
  created_at: MOMENT,
});

export type RecordingRow = z.infer<typeof RECORDING_ROW>;

export const IR_CODE_FORMATS = ['pulses', 'head_key', 'library'] as const;

export const IR_CODE_FORMAT = z.enum(IR_CODE_FORMATS);

export const REMOTE_NAME = boundedText(80);

export const IR_REMOTE_ROW = z.strictObject({
  id: ID,
  blaster_id: ID,
  name: REMOTE_NAME,
  category: z.string().min(1),
  brand: z.string().min(1).nullable(),
  created_at: MOMENT,
});

export type IrRemoteRow = z.infer<typeof IR_REMOTE_ROW>;

export const BUTTON_NAME = boundedText(60);

export const IR_CODE_ROW = z.strictObject({
  id: ID,
  remote_id: ID,
  button: BUTTON_NAME,
  format: IR_CODE_FORMAT,
  code: z.string().min(1),
  created_at: MOMENT,
});

export type IrCodeRow = z.infer<typeof IR_CODE_ROW>;

export const SCENE_NAME = boundedText(80);

export const SCENE_ROW = z.strictObject({
  id: ID,
  name: SCENE_NAME,
  icon: z.string().min(1),
  actions: JSON_LIST,
  position: POSITION,
  created_at: MOMENT,
});

export type SceneRow = z.infer<typeof SCENE_ROW>;

export const AUTOMATION_NAME = boundedText(80);

export const AUTOMATION_ROW = z.strictObject({
  id: ID,
  name: AUTOMATION_NAME,
  enabled: FLAG,
  definition: JSON_OBJECT,
  last_run_at: MOMENT.nullable(),
  last_error: z.string().nullable(),
  run_count: COUNT,
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type AutomationRow = z.infer<typeof AUTOMATION_ROW>;

export const LAYOUT_PAGE_NAME = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/);

export const LAYOUT_ROW = z.strictObject({
  client_id: ID.nullable(),
  profile_id: ID.nullable().default(null),
  page: LAYOUT_PAGE_NAME,
  layout: JSON_OBJECT,
  updated_at: MOMENT,
});

export type LayoutRow = z.infer<typeof LAYOUT_ROW>;

export const PUSH_PLATFORMS = ['android'] as const;

export const PUSH_TOKEN = z.string().min(1).max(4096);

export const PUSH_TARGET_ROW = z.strictObject({
  token: PUSH_TOKEN,
  client_id: ID,
  platform: z.enum(PUSH_PLATFORMS),
  created_at: MOMENT,
});

export type PushTargetRow = z.infer<typeof PUSH_TARGET_ROW>;
