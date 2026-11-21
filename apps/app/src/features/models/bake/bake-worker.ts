import { yieldTask } from './bake-clips';
import { failed, requestIdOf } from './bake-protocol';
import { createBakeContext, detailOf, settleBake } from './bake-run';
import { offscreenStaging } from './bake-staging';
import { FROM_BAKE_WORKER, TO_BAKE_WORKER, type FromBakeWorker } from './bake-worker-protocol';

function post(message: FromBakeWorker): void {
  self.postMessage(FROM_BAKE_WORKER.parse(message));
}

const canvas = new OffscreenCanvas(1, 1);

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  post({ kind: 'lost' });
});

const made = createBakeContext(canvas, { staging: offscreenStaging(), pause: yieldTask });

const context = typeof made === 'string' ? null : made;

let chain: Promise<void> = Promise.resolve();

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const { text } = TO_BAKE_WORKER.parse(event.data);
  chain = chain
    .then(() => settleBake(context, text))
    .then(
      (result) => {
        post({ kind: 'result', text: JSON.stringify(result) });
      },
      (error: unknown) => {
        const id = requestIdOf(text) ?? 'unknown';
        post({ kind: 'result', text: JSON.stringify(failed(id, 'render', detailOf(error))) });
      },
    );
});

post(typeof made === 'string' ? { kind: 'unavailable', detail: made } : { kind: 'ready' });
