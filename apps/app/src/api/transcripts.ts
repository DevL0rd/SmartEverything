import {
  API_ENDPOINTS as E,
  type TranscriptSession,
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

export async function deleteTranscriptLine(sessionId: string, lineId: number): Promise<void> {
  await api().call(E.removeTranscript, { params: { sessionId }, query: { lineId } });
  log.info('transcript.line_deleted', { sessionId, lineId });
}

export function listTranscriptSessions(query: {
  readonly source: TranscriptSession['source'];
  readonly pluginId?: string;
  readonly limit: number;
}): Promise<TranscriptSession[]> {
  return api().call(E.listTranscripts, { query });
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
