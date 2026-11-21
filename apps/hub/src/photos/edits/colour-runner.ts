import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { isIdentityPlan, type ColourPlan } from './colour-pass';
import type { ColourRequest } from './colour-worker';

export const BUNDLED_COLOUR_WORKER = fileURLToPath(new URL('./colour-worker.mjs', import.meta.url));

const REPLY = z.instanceof(Uint8Array);

export class ColourRunner {
  constructor(private readonly script: string) {}

  async run(
    pixels: Uint8Array<ArrayBuffer>,
    channels: number,
    plan: ColourPlan,
  ): Promise<Uint8Array> {
    if (isIdentityPlan(plan)) return pixels;
    const worker = new Worker(this.script);
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        worker.once('message', (reply: unknown) => {
          const parsed = REPLY.safeParse(reply);
          if (parsed.success) resolve(parsed.data);
          else reject(new Error('The colour worker answered with something that is not pixels.'));
        });
        worker.once('error', reject);
        worker.once('exit', (code) => {
          reject(new Error(`The colour worker stopped with code ${String(code)}.`));
        });
        const request: ColourRequest = {
          pixels,
          channels,
          plan: {
            matrix: [...plan.matrix],
            curves: {
              red: [...plan.curves.red],
              green: [...plan.curves.green],
              blue: [...plan.curves.blue],
            },
          },
        };
        worker.postMessage(request, pixels.buffer instanceof ArrayBuffer ? [pixels.buffer] : []);
      });
    } finally {
      await worker.terminate();
    }
  }
}
