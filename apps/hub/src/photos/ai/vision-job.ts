import { readFile, stat } from 'node:fs/promises';
import { messageOf } from '@smarteverything/logging';
import { fsCode } from '../../fs-code';
import type { VisionAnalysis, VisionOutcome, VisionRequest } from '../../openrouter/vision';
import type { DriveMediaJob } from '../../store/repositories/drive-media-jobs';
import { derivedPath, DERIVED_MIME } from '../pipeline/derived-paths';
import type { JobHandler } from '../pipeline/jobs';
import { playableCopyPath } from '../pipeline/playable';
import { searchWords } from './description';
import { sourceOf, type AiEnvironment, type MediaItem } from './env';
import type { AiJobSource, VisionResult } from './job-units';

export interface VisionClient {
  readonly analyse: (request: VisionRequest) => Promise<VisionOutcome>;
}

function resultOf(analysis: VisionAnalysis | null): VisionResult {
  if (analysis === null) return { state: 'needs_key' };
  return { state: 'done', ...analysis, words: searchWords(analysis) };
}

interface Payload {
  readonly mime: string;
  readonly data: Buffer;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return false;
    throw cause;
  }
}

export class VisionHandler implements JobHandler {
  readonly resource = 'cloud';

  constructor(
    private readonly env: AiEnvironment,
    private readonly vision: VisionClient,
  ) {}

  async run(job: DriveMediaJob, signal: AbortSignal): Promise<void> {
    const source = await sourceOf(this.env, job);
    if (source?.switches.smartSearch !== true) return;
    const { item, subject } = source;
    const model = source.models.vision;
    const payload = await this.payload(source);
    const outcome = await this.vision.analyse({
      profileId: subject,
      itemId: item.id,
      model,
      mime: payload.mime,
      data: payload.data,
      signal,
    });
    const analysis = outcome.state === 'done' ? outcome.analysis : null;
    const settled = await this.env.host.write('photoVisionSettle', {
      itemId: item.id,
      rev: job.rev,
      subject,
      model,
      result: resultOf(analysis),
    });
    if (!settled || analysis === null) return;
    this.env.log.debug('analysis.done', {
      itemId: item.id,
      labels: analysis.labels.length,
      pets: analysis.pets.length,
    });
    await this.next(source, analysis);
  }

  async fail(job: DriveMediaJob, cause: unknown): Promise<void> {
    const recorded = await this.env.host.write('photoVisionFail', {
      itemId: job.item_id,
      rev: job.rev,
      error: messageOf(cause),
    });
    if (recorded)
      this.env.log.warn('analysis.failed', { itemId: job.item_id, reason: messageOf(cause) });
  }

  private async payload(source: AiJobSource): Promise<Payload> {
    const { item } = source;
    if (item.kind === 'video' && source.playableReady)
      return { mime: 'video/mp4', data: await readFile(await this.playable(item)) };
    return {
      mime: DERIVED_MIME,
      data: await readFile(
        derivedPath(this.env.layout, { itemId: item.id, rev: item.rev, size: 'preview' }),
      ),
    };
  }

  private async playable(item: MediaItem): Promise<string> {
    for (const copy of ['fullHd', 'full'] as const) {
      const path = playableCopyPath(this.env.layout, item.id, item.rev, copy);
      if (await exists(path)) return path;
    }
    return this.env.locate(item);
  }

  private async next(source: AiJobSource, analysis: VisionAnalysis): Promise<void> {
    const { item, models } = source;
    const target = { itemId: item.id, rev: item.rev };
    await this.env.queue.rerun([
      { kind: 'embed', ...target, modelVersion: models.embedding },
      ...(analysis.pets.length > 0
        ? [{ kind: 'pet_embed' as const, ...target, modelVersion: models.petEmbedding }]
        : []),
    ]);
  }
}
