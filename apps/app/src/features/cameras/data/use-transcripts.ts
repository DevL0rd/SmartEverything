import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  TranscriptDetail,
  TranscriptHit,
  TranscriptSession,
  TranscriptSettings,
  TranscriptSettingsChange,
  TranscriptStatus,
} from '@smarteverything/domain';
import {
  deleteTranscript,
  readTranscript,
  readTranscripts,
  readTranscriptSettings,
  readTranscriptStatus,
  saveTranscriptSettings,
  searchTranscripts,
} from '../../../api/transcripts';
import { TRANSCRIPT_PREFIX, transcriptKeys } from '../../../queries/keys';
import { useIsOwner } from '../../../store/selectors';

export function useTranscripts(): UseQueryResult<TranscriptSession[]> {
  const owner = useIsOwner();
  return useQuery({
    queryKey: transcriptKeys.sessions(),
    queryFn: readTranscripts,
    enabled: owner,
  });
}

export function useTranscript(sessionId: string): UseQueryResult<TranscriptDetail> {
  const owner = useIsOwner();
  return useQuery({
    queryKey: transcriptKeys.session(sessionId),
    queryFn: () => readTranscript(sessionId),
    enabled: owner,
  });
}

export function useTranscriptSearch(words: string): UseQueryResult<TranscriptHit[]> {
  const owner = useIsOwner();
  return useQuery({
    queryKey: transcriptKeys.search(words),
    queryFn: () => searchTranscripts(words),
    enabled: owner && words !== '',
  });
}

export function useTranscriptSettings(): UseQueryResult<TranscriptSettings> {
  return useQuery({ queryKey: transcriptKeys.settings(), queryFn: readTranscriptSettings });
}

export function useTranscriptStatus(): UseQueryResult<TranscriptStatus> {
  return useQuery({ queryKey: transcriptKeys.status(), queryFn: readTranscriptStatus });
}

export interface TranscriptActions {
  readonly saveSettings: (change: TranscriptSettingsChange) => Promise<void>;
  readonly remove: (sessionId: string) => Promise<void>;
  readonly refreshStatus: () => void;
}

export function useTranscriptActions(): TranscriptActions {
  const client = useQueryClient();
  return {
    saveSettings: async (change): Promise<void> => {
      const saved = await saveTranscriptSettings(change);
      client.setQueryData(transcriptKeys.settings(), saved);
      void client.invalidateQueries({ queryKey: transcriptKeys.status() });
    },
    remove: async (sessionId): Promise<void> => {
      await deleteTranscript(sessionId);
      await client.invalidateQueries({ queryKey: TRANSCRIPT_PREFIX });
    },
    refreshStatus: (): void => {
      void client.invalidateQueries({ queryKey: transcriptKeys.status() });
    },
  };
}
