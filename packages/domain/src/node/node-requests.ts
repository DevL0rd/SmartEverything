import { z } from 'zod';
import { HISTORY_QUERY } from '../history-backfill';
import { MACHINE_OPEN_TARGET } from '../machine-actions';
import { JSON_VALUE } from '../values';
import { AUDIO_CHANGE } from './computer-audio';
import { CAPTURE_TARGETS } from './computer-capture';
import { COMPUTER_INPUT } from './computer-input';
import { DISPLAY_CHANGE } from './computer-displays';
import {
  DOWNLOAD_PATHS,
  FILE_CHUNK_BYTES,
  FILE_PATH,
  FILE_SEARCH_QUERY,
  FILE_UPLOAD_CHUNK,
  FILE_WRITE_CHANGE,
} from './computer-files';
import { PROCESS_QUERY, PROCESS_SIGNALS } from './computer-processes';
import { SERVICE_CHANGE, STARTUP_CHANGE, SYSTEM_CHANGE } from './computer-system';
import { TILING_CHANGE } from './computer-tiling';
import { WINDOW_CHANGE } from './computer-windows';
import type { ComputerScope } from './computer-scopes';
import { MEDIA_STATUSES } from './computer-session-state';

export const POWER_ACTIONS = [
  'shut_down',
  'restart',
  'sleep',
  'hibernate',
  'lock_screen',
  'sign_out',
] as const;

export type PowerAction = (typeof POWER_ACTIONS)[number];

export const COMPUTER_ACTIONS = [...POWER_ACTIONS, 'wake'] as const;

export type ComputerAction = (typeof COMPUTER_ACTIONS)[number];

const APP_ID = z.string().min(1).max(200);

export const NODE_REQUEST = z.discriminatedUnion('verb', [
  z.strictObject({ verb: z.literal('power'), action: z.enum(POWER_ACTIONS) }),
  z.strictObject({ verb: z.literal('processes'), query: PROCESS_QUERY }),
  z.strictObject({
    verb: z.literal('signal'),
    pid: z.int().positive(),
    signal: z.enum(PROCESS_SIGNALS),
  }),
  z.strictObject({ verb: z.literal('links') }),
  z.strictObject({ verb: z.literal('volume'), level: z.number().min(0).max(100) }),
  z.strictObject({ verb: z.literal('mute'), muted: z.boolean() }),
  z.strictObject({ verb: z.literal('playback'), status: z.enum(MEDIA_STATUSES) }),
  z.strictObject({ verb: z.literal('apps') }),
  z.strictObject({ verb: z.literal('open_app'), appId: APP_ID }),
  z.strictObject({ verb: z.literal('close_app'), appId: APP_ID, force: z.boolean() }),
  z.strictObject({
    verb: z.literal('files'),
    path: FILE_PATH.nullable(),
    cursor: z.int().nonnegative(),
  }),
  z.strictObject({ verb: z.literal('file'), path: FILE_PATH }),
  z.strictObject({
    verb: z.literal('file_range'),
    path: FILE_PATH,
    start: z.int().nonnegative(),
    length: z.int().min(1).max(FILE_CHUNK_BYTES),
  }),
  z.strictObject({ verb: z.literal('capture'), target: z.enum(CAPTURE_TARGETS) }),
  z.strictObject({ verb: z.literal('input'), input: COMPUTER_INPUT }),
  z.strictObject({ verb: z.literal('audio') }),
  z.strictObject({ verb: z.literal('audio_set'), change: AUDIO_CHANGE }),
  z.strictObject({ verb: z.literal('displays') }),
  z.strictObject({ verb: z.literal('display_set'), change: DISPLAY_CHANGE, revert: z.boolean() }),
  z.strictObject({
    verb: z.literal('display_confirm'),
    token: z.string().min(1),
    keep: z.boolean(),
  }),
  z.strictObject({ verb: z.literal('system') }),
  z.strictObject({ verb: z.literal('system_set'), change: SYSTEM_CHANGE }),
  z.strictObject({ verb: z.literal('windows') }),
  z.strictObject({ verb: z.literal('window_set'), change: WINDOW_CHANGE }),
  z.strictObject({ verb: z.literal('tiling') }),
  z.strictObject({ verb: z.literal('tiling_set'), change: TILING_CHANGE }),
  z.strictObject({ verb: z.literal('startup') }),
  z.strictObject({ verb: z.literal('startup_set'), change: STARTUP_CHANGE }),
  z.strictObject({ verb: z.literal('services') }),
  z.strictObject({ verb: z.literal('service_set'), change: SERVICE_CHANGE }),
  z.strictObject({ verb: z.literal('process_detail'), pid: z.int().positive() }),
  z.strictObject({
    verb: z.literal('priority'),
    pid: z.int().positive(),
    nice: z.int().min(-20).max(19),
  }),
  z.strictObject({ verb: z.literal('files_search'), query: FILE_SEARCH_QUERY }),
  z.strictObject({ verb: z.literal('file_properties'), path: FILE_PATH }),
  z.strictObject({ verb: z.literal('file_write'), change: FILE_WRITE_CHANGE }),
  z.strictObject({ verb: z.literal('file_upload'), chunk: FILE_UPLOAD_CHUNK }),
  z.strictObject({ verb: z.literal('file_places') }),
  z.strictObject({ verb: z.literal('download_open'), paths: DOWNLOAD_PATHS }),
  z.strictObject({
    verb: z.literal('download_read'),
    id: z.string().min(1),
    length: z.int().min(1).max(FILE_CHUNK_BYTES),
  }),
  z.strictObject({ verb: z.literal('download_close'), id: z.string().min(1) }),
  z.strictObject({ verb: z.literal('history'), query: HISTORY_QUERY }),
  z.strictObject({ verb: z.literal('ring'), on: z.boolean() }),
  z.strictObject({ verb: z.literal('open'), target: MACHINE_OPEN_TARGET }),
  z.strictObject({ verb: z.literal('unlock') }),
  z.strictObject({ verb: z.literal('show_unlock') }),
]);

export type NodeRequest = z.infer<typeof NODE_REQUEST>;

export const NODE_FAILURE_CODES = [
  'scope_off',
  'not_supported',
  'not_permitted',
  'blocked',
  'not_found',
  'not_own',
  'no_session',
  'failed',
] as const;

export type NodeFailureCode = (typeof NODE_FAILURE_CODES)[number];

export const NODE_FAILURE = z.strictObject({
  code: z.enum(NODE_FAILURE_CODES),
  message: z.string().min(1).max(500),
});

export type NodeFailure = z.infer<typeof NODE_FAILURE>;

export const NODE_RESULT = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), value: JSON_VALUE }),
  z.strictObject({ ok: z.literal(false), failure: NODE_FAILURE }),
]);

export type NodeResult = z.infer<typeof NODE_RESULT>;

export type NodeVerb = NodeRequest['verb'];

export const NODE_VERB_SCOPES: Readonly<Record<NodeVerb, ComputerScope | null>> = {
  power: 'power',
  processes: 'processes',
  signal: 'processes',
  links: null,
  volume: null,
  mute: null,
  playback: null,
  apps: 'apps',
  open_app: 'apps',
  close_app: 'apps',
  files: 'files',
  file: 'files',
  file_range: 'files',
  capture: 'screenshots',
  input: 'input',
  audio: 'system',
  audio_set: 'system',
  displays: 'system',
  display_set: 'system',
  display_confirm: 'system',
  system: 'system',
  system_set: 'system',
  windows: 'apps',
  window_set: 'apps',
  tiling: 'apps',
  tiling_set: 'apps',
  startup: 'apps',
  startup_set: 'apps',
  services: 'system',
  service_set: 'system',
  process_detail: 'processes',
  priority: 'processes',
  files_search: 'files',
  file_properties: 'files',
  file_write: 'files',
  file_upload: 'files',
  file_places: 'files',
  download_open: 'files',
  download_read: 'files',
  download_close: 'files',
  history: 'metrics',
  ring: 'apps',
  open: 'apps',
  unlock: 'power',
  show_unlock: 'power',
};
