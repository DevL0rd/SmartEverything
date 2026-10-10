import {
  API_ENDPOINTS as E,
  type TranscriptDetail,
  type TranscriptHit,
  type TranscriptSession,
  type TranscriptSettings,
  type TranscriptSettingsChange,
  type TranscriptStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.transcripts');

const SESSIONS_SHOWN = 100;

const LINES_SHOWN = 1000;

const HITS_SHOWN = 50;

export function readTranscripts(): Promise<TranscriptSession[]> {
  return api().call(E.listTranscripts, { query: { limit: SESSIONS_SHOWN } });
}

export function readTranscript(sessionId: string): Promise<TranscriptDetail> {
  return api().call(E.readTranscript, {
    params: { sessionId },
    query: { limit: LINES_SHOWN },
  });
}

export function searchTranscripts(words: string): Promise<TranscriptHit[]> {
  return api().call(E.searchTranscripts, { query: { q: words, limit: HITS_SHOWN } });
}

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

export function readTranscriptStatus(): Promise<TranscriptStatus> {
  return api().call(E.readTranscriptStatus, {});
}
