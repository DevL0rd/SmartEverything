import type { Logger } from '@smarteverything/logging';
import { GlbWorker } from '../models/glb-worker';
import { ResponseEncoder } from '../server/responses/encoder';

export interface Codecs {
  readonly responses: ResponseEncoder;
  readonly models: GlbWorker;
}

export function openCodecs(script: string, log: Logger): Codecs {
  return { responses: new ResponseEncoder(script, log), models: new GlbWorker(script, log) };
}

export async function closeCodecs(codecs: Codecs): Promise<void> {
  await Promise.all([codecs.responses.close(), codecs.models.close()]);
}
