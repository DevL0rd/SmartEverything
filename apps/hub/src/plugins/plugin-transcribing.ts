import { randomUUID } from 'node:crypto';
import { type TranscriptLine } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
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

class PluginTranscriptLines {
  private readonly lines: TranscriptLine[] = [];
  private chain: Promise<void>;
  private open = true;
  private readonly forget: () => void;

  constructor(
    private readonly services: PluginVoiceServices,
    private readonly scope: Scope,
    readonly id: string,
    opened: Promise<unknown>,
  ) {
    this.chain = opened.then(() => undefined);
    this.forget = services.transcripts.onRemoved(id, (lineId) => {
      const kept = lineId === null ? [] : this.lines.filter((line) => line.id !== lineId);
      this.lines.splice(0, this.lines.length, ...kept);
    });
  }

  add(line: PluginTranscriptLine): void {
    this.after(async () => {
      this.lines.push(
        await this.services.transcripts.add(this.id, {
          at: line.at,
          speaker_id: line.speakerId,
          speaker: line.speaker,
          text: line.text,
          bot: line.bot,
        }),
      );
    }, 'plugins.transcript_line_failed');
  }

  recent(sinceMs: number, limit: number): readonly TranscriptLine[] {
    const since = this.services.clock.now().getTime() - sinceMs;
    const heard = this.lines.filter((line) => Date.parse(line.at) >= since);
    return heard.slice(Math.max(0, heard.length - limit));
  }

  finish(endedAt?: string): void {
    if (!this.open) return;
    this.open = false;
    this.after(async () => {
      try {
        await this.services.transcripts.close(this.id, endedAt);
      } finally {
        this.forget();
      }
    }, 'plugins.transcript_close_failed');
  }

  private after(work: () => Promise<void>, failure: string): void {
    const next = this.chain.then(work);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    background(next, failure, { pluginId: this.scope.pluginId });
  }
}

export function openTranscript(
  services: PluginVoiceServices,
  scope: Scope,
  request: PluginTranscriptRequest,
): PluginTranscript {
  const id = randomUUID();
  const transcript = new PluginTranscriptLines(
    services,
    scope,
    id,
    services.transcripts.open({
      id,
      source: 'plugin',
      sourceId: request.key,
      pluginId: scope.pluginId,
      title: request.title,
      retentionDays: request.retentionDays,
      ...(request.startedAt === undefined ? {} : { startedAt: request.startedAt }),
    }),
  );
  const stop = scope.track(() => {
    transcript.finish();
  });
  return {
    id,
    add: (line): void => {
      transcript.add(line);
    },
    recent: (sinceMs, limit): readonly TranscriptLine[] => transcript.recent(sinceMs, limit),
    close: (endedAt): void => {
      transcript.finish(endedAt);
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
