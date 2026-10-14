import {
  API_ENDPOINTS as E,
  type TranscriptSettings,
  type TranscriptSettingsChange,
  type TranscriptStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.transcripts');

export async function deleteTranscript(sessionId: string): Promise<void> {
  await api().call(E.removeTranscript, { params: { sessionId } });
  log.info('transcript.deleted', { sessionId });
}

export function readTranscriptSettings(): Promise<TranscriptSettings> {
  return api().call(E.readTranscriptSettings, {});
}

export async function saveTranscriptSettings(
  change: TranscriptSettingsChange,
): Promise<TranscriptSettings> {
  const saved = await api().call(E.updateTranscriptSettings, { body: change });
  log.info('transcript.settings_saved', { ...change });
  return saved;
}

export function readTranscriptStatus(cameraId?: string): Promise<TranscriptStatus> {
  return api().call(E.readTranscriptStatus, { query: cameraId === undefined ? {} : { cameraId } });
}
