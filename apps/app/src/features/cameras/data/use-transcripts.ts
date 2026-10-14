import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  TranscriptSettings,
  TranscriptSettingsChange,
  TranscriptStatus,
} from '@smarteverything/domain';
import {
  readTranscriptSettings,
  readTranscriptStatus,
  saveTranscriptSettings,
} from '../../../api/transcripts';
import { transcriptKeys } from '../../../queries/keys';

export function useTranscriptSettings(): UseQueryResult<TranscriptSettings> {
  return useQuery({ queryKey: transcriptKeys.settings(), queryFn: readTranscriptSettings });
}

export function useTranscriptStatus(cameraId?: string): UseQueryResult<TranscriptStatus> {
  return useQuery({
    queryKey: transcriptKeys.status(cameraId),
    queryFn: () => readTranscriptStatus(cameraId),
  });
}

export interface TranscriptActions {
  readonly saveSettings: (change: TranscriptSettingsChange) => Promise<void>;
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
    refreshStatus: (): void => {
      void client.invalidateQueries({ queryKey: transcriptKeys.status() });
    },
  };
}
