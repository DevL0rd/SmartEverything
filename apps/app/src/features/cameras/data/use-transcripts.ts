import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
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
import { background } from '@smarteverything/logging';

export function useTranscriptSettings(): UseQueryResult<TranscriptSettings> {
  return useScreenQuery({ queryKey: transcriptKeys.settings(), queryFn: readTranscriptSettings });
}

export function useTranscriptStatus(cameraId?: string): UseQueryResult<TranscriptStatus> {
  return useScreenQuery({
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
      background(
        client.invalidateQueries({ queryKey: transcriptKeys.status() }),
        'queries.invalidate_failed',
      );
    },
    refreshStatus: (): void => {
      background(
        client.invalidateQueries({ queryKey: transcriptKeys.status() }),
        'queries.invalidate_failed',
      );
    },
  };
}
