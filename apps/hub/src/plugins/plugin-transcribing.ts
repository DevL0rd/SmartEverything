import { type TranscriptLine } from '@smarteverything/domain';
import { ownerProfileOf } from '../transcripts/owner';
import type { PluginVoiceServices, Scope } from './plugin-voice';

export interface PluginTranscriptRequest {
  readonly key: string;
  readonly title: string;
  readonly retentionDays: number;
  readonly startedAt?: string;
}

interface PluginTranscriptLine {
  readonly at: string;
  readonly speakerId: string | null;
  readonly speaker: string;
  readonly text: string;
  readonly bot: boolean;
}

export interface PluginTranscript {
  readonly id: string;
  readonly add: (line: PluginTranscriptLine) => void;
  readonly recent: (sinceMs: number, limit: number) => readonly TranscriptLine[];
  readonly close: (endedAt?: string) => void;
}

export interface PluginTranscribeRequest {
  readonly pcm16k: Int16Array;
  readonly recent: readonly string[];
  readonly names?: readonly string[];
  readonly language?: string;
}

export function openTranscript(
  services: PluginVoiceServices,
  scope: Scope,
  request: PluginTranscriptRequest,
): PluginTranscript {
  const { transcripts } = services;
  const session = transcripts.open({
    source: 'plugin',
    sourceId: request.key,
    pluginId: scope.pluginId,
    title: request.title,
    retentionDays: request.retentionDays,
    ...(request.startedAt === undefined ? {} : { startedAt: request.startedAt }),
  });
  let open = true;
  const finish = (endedAt?: string): void => {
    if (open) {
      open = false;
      transcripts.close(session.id, endedAt);
    }
  };
  const stop = scope.track(finish);
  return {
    id: session.id,
    add: (line): void => {
      transcripts.add(session.id, {
        at: line.at,
        speaker_id: line.speakerId,
        speaker: line.speaker,
        text: line.text,
        bot: line.bot,
      });
    },
    recent: (sinceMs, limit) => transcripts.recent(session.id, sinceMs, limit),
    close: (endedAt): void => {
      finish(endedAt);
      stop();
    },
  };
}

export function transcribeFor(
  services: PluginVoiceServices,
  scope: Scope,
  request: PluginTranscribeRequest,
): Promise<string | null> {
  return services.transcriber.transcribe({
    pcm16k: request.pcm16k,
    profileId: ownerProfileOf(services.store),
    pluginId: scope.pluginId,
    names: [...services.names(), ...(request.names ?? [])],
    recent: request.recent,
    ...(request.language === undefined ? {} : { language: request.language }),
    meta: { plugin: scope.pluginId },
  });
}
