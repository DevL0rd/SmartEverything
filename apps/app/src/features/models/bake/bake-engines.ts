import { Logger, background } from '@smarteverything/logging';
import type { BakeContext } from './bake-layers';
import { failed, requestIdOf } from './bake-protocol';
import { createBakeContext, detailOf, settleBake } from './bake-run';
import { documentStaging } from './bake-staging';
import { FROM_BAKE_WORKER, TO_BAKE_WORKER } from './bake-worker-protocol';

const log = new Logger('app.models');

export interface BakeEvents {
  readonly ready: () => void;
  readonly result: (text: string) => void;
  readonly lost: (cause: string) => void;
  readonly unavailable: (detail: string) => void;
}

interface BakeEngine {
  readonly send: (text: string) => void;
  readonly dispose: () => void;
}

function idleSlice(): Promise<void> {
  return new Promise((resolve) => {
    requestIdleCallback(() => {
      resolve();
    });
  });
}

function inlineChain(context: BakeContext, events: BakeEvents): BakeEngine['send'] {
  let chain: Promise<void> = Promise.resolve();
  return (text) => {
    chain = chain
      .then(idleSlice)
      .then(() => settleBake(context, text))
      .then((result) => {
        events.result(JSON.stringify(result));
      });
    background(chain, 'model.bake_send_failed');
  };
}

function inlineEngine(canvas: HTMLCanvasElement, events: BakeEvents): BakeEngine | string {
  const lost = (event: Event): void => {
    event.preventDefault();
    events.lost('webgl_context_lost');
  };
  canvas.addEventListener('webglcontextlost', lost);
  const made = createBakeContext(canvas, { staging: documentStaging(), pause: idleSlice });
  if (typeof made === 'string') {
    canvas.removeEventListener('webglcontextlost', lost);
    return made;
  }
  return {
    send: inlineChain(made, events),
    dispose: (): void => {
      canvas.removeEventListener('webglcontextlost', lost);
      made.dispose();
    },
  };
}

function workerBakingSupported(): boolean {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function';
}

interface WorkerStart {
  readonly events: BakeEvents;
  readonly fallBack: (reason: string) => void;
}

function listen(worker: Worker, start: WorkerStart): void {
  let started = false;
  worker.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = FROM_BAKE_WORKER.parse(event.data);
    if (message.kind === 'ready') {
      started = true;
      start.events.ready();
    } else if (message.kind === 'result') {
      start.events.result(message.text);
    } else if (message.kind === 'lost') {
      start.events.lost('webgl_context_lost');
    } else {
      start.fallBack(message.detail);
    }
  });
  worker.addEventListener('error', (event: ErrorEvent) => {
    event.preventDefault();
    if (started) start.events.lost(`worker_error: ${event.message}`);
    else start.fallBack(event.message);
  });
}

function workerEngine(start: WorkerStart): BakeEngine {
  const worker = new Worker(new URL('./bake-worker', import.meta.url));
  listen(worker, start);
  return {
    send: (text): void => {
      worker.postMessage(TO_BAKE_WORKER.parse({ kind: 'bake', text }));
    },
    dispose: (): void => {
      worker.terminate();
    },
  };
}

export interface BakeDriver extends BakeEngine {
  readonly start: () => void;
}

export function refuseBake(events: BakeEvents, text: string, detail: string): void {
  const id = requestIdOf(text);
  if (id === null) throw new Error(`the baker got a request without an id: ${detail}`);
  events.result(JSON.stringify(failed(id, 'webgl', detail)));
}

export function bakeDriver(canvas: HTMLCanvasElement, events: BakeEvents): BakeDriver {
  let engine: BakeEngine | null = null;
  let disposed = false;
  const inline = (reason: string): void => {
    engine?.dispose();
    engine = null;
    if (disposed) return;
    log.warn('model.bake_inline', { reason });
    const made = inlineEngine(canvas, events);
    if (typeof made === 'string') {
      events.unavailable(made);
      return;
    }
    engine = made;
    events.ready();
  };
  return {
    start: (): void => {
      if (!workerBakingSupported()) {
        inline('worker_or_offscreen_canvas_missing');
        return;
      }
      try {
        engine = workerEngine({ events, fallBack: inline });
      } catch (error) {
        inline(`worker_failed_to_start: ${detailOf(error)}`);
      }
    },
    send: (text): void => {
      if (engine === null) {
        refuseBake(events, text, 'the baker has no engine');
        return;
      }
      engine.send(text);
    },
    dispose: (): void => {
      disposed = true;
      engine?.dispose();
      engine = null;
    },
  };
}
