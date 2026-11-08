import type { ListeningConfig } from '@smarteverything/domain';
import type { SpeechSegment } from '../../../listening/speech-segment';
import type { EarClaim, EarPipeline, EarPipelineHandlers } from '../ear-pipeline';
import type { EarProcess, EarSession } from './ear-process';
import type { LocalSink } from './process-events';
import { EAR_CALL, EAR_COMMAND } from './protocol';

class RemoteEarPipeline implements EarPipeline, EarSession, LocalSink {
  constructor(
    private readonly process: EarProcess,
    readonly id: number,
    private readonly config: ListeningConfig,
    private readonly handlers: EarPipelineHandlers,
  ) {}

  async replay(): Promise<void> {
    await this.process.call(EAR_CALL.localOpen, { id: this.id, config: this.config });
  }

  crashed(): void {
    return undefined;
  }

  hear(pcm: Int16Array): void {
    this.process.command(EAR_COMMAND.localAudio, { id: this.id, pcm });
  }

  async close(): Promise<void> {
    this.process.detach(this);
    try {
      if (this.process.ready) {
        await this.process.call(EAR_CALL.localClose, { id: this.id });
      }
    } finally {
      this.process.sinks.locals.delete(this.id);
    }
  }

  claimed(claim: EarClaim): void {
    this.handlers.claimed(claim);
  }

  segment(segment: SpeechSegment): void {
    this.handlers.segment(segment);
  }

  failed(reason: string): void {
    this.handlers.failed(reason);
  }
}

export async function remoteEarPipeline(
  process: EarProcess,
  config: ListeningConfig,
  handlers: EarPipelineHandlers,
): Promise<EarPipeline> {
  const pipeline = new RemoteEarPipeline(process, process.nextLocal(), config, handlers);
  process.sinks.locals.set(pipeline.id, pipeline);
  if (process.ready) {
    try {
      await pipeline.replay();
    } catch (cause) {
      process.sinks.locals.delete(pipeline.id);
      throw cause;
    }
    process.track(pipeline);
  } else {
    process.attach(pipeline);
  }
  return pipeline;
}
