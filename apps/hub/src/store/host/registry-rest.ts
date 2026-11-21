import {
  WORLD_EVENTS_UNIT,
  WORLD_HEALTH_UNIT,
  WORLD_LATEST_UNIT,
  WORLD_SERIES_UNIT,
  WORLD_STATE_BUCKETS_UNIT,
} from '../../automations/world-v3/history-units';
import {
  STORE_OPEN_UNIT,
  STORE_RETENTION_READ_UNITS,
  STORE_RETENTION_WRITE_UNITS,
} from '../open-unit';
import { HARNESS_RESTART_SETTLE_UNIT } from '../../harness/restart-settle';
import { ACCESS_MIRROR_UNIT } from '../access-mirror';
import {
  SPEECH_ADMISSION_UNIT,
  SPEECH_CALLER_UNIT,
  SPEECH_CATALOGUE_UNIT,
} from '../../transcripts/speech-admission';
import {
  TRANSCRIPT_DETAIL_UNIT,
  TRANSCRIPT_FEED_UNIT,
  TRANSCRIPT_RANGE_UNIT,
} from '../../transcripts/transcript-units';
import {
  UNLINKED_FOLDERS_LEFT_UNIT,
  UNLINKED_FOLDERS_UNIT,
  UNLINKED_FOLDER_FORGET_UNIT,
} from '../../service/unlinked-folder-units';

export const REST_READ_UNITS = {
  accessMirror: ACCESS_MIRROR_UNIT,
  speechAdmission: SPEECH_ADMISSION_UNIT,
  ...STORE_RETENTION_READ_UNITS,
  speechCaller: SPEECH_CALLER_UNIT,
  speechCatalogue: SPEECH_CATALOGUE_UNIT,
  transcriptDetail: TRANSCRIPT_DETAIL_UNIT,
  transcriptFeed: TRANSCRIPT_FEED_UNIT,
  transcriptRange: TRANSCRIPT_RANGE_UNIT,
  unlinkedFolders: UNLINKED_FOLDERS_UNIT,
  unlinkedFoldersLeft: UNLINKED_FOLDERS_LEFT_UNIT,
  worldEvents: WORLD_EVENTS_UNIT,
  worldHealth: WORLD_HEALTH_UNIT,
  worldLatest: WORLD_LATEST_UNIT,
  worldSeries: WORLD_SERIES_UNIT,
  worldStateBuckets: WORLD_STATE_BUCKETS_UNIT,
} as const;

export const REST_WRITE_UNITS = {
  harnessRestartSettle: HARNESS_RESTART_SETTLE_UNIT,
  storeOpen: STORE_OPEN_UNIT,
  ...STORE_RETENTION_WRITE_UNITS,
  unlinkedFolderForget: UNLINKED_FOLDER_FORGET_UNIT,
} as const;
