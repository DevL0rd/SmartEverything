import type { Logger } from '@smarteverything/logging';
import { CodecThread, CodecWorkerError } from '../codec/thread';
import type { GlbPrepared } from './glb-lod';

export class GlbWorker {
  private readonly thread: CodecThread;

  constructor(script: string, log: Logger) {
    this.thread = new CodecThread(script, 'models', log.forArea('hub.models'));
  }

  async prepare(bytes: Uint8Array): Promise<GlbPrepared> {
    const reply = await this.thread.run({ kind: 'glb', bytes });
    if (reply.kind === 'glb') return { ok: true, triangles: reply.triangles, levels: reply.levels };
    if (reply.kind === 'glb_refused') {
      return { ok: false, stage: reply.stage, problem: reply.problem };
    }
    throw new CodecWorkerError(`The models worker answered ${reply.kind} to a GLB.`);
  }

  close(): Promise<void> {
    return this.thread.close();
  }
}
