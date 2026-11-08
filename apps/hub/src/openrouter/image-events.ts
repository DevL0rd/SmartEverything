import { Logger, describeFailure } from '@smarteverything/logging';
import { EventSourceParserStream, type EventSourceMessage } from 'eventsource-parser/stream';
import { openRouterError } from './errors';

const log = new Logger('hub.openrouter-image-events');

const DONE = '[DONE]';

type Reader = ReadableStreamDefaultReader<EventSourceMessage>;

interface IdleWatch {
  touch(): void;
  read(reader: Reader): Promise<Awaited<ReturnType<Reader['read']>>>;
}

function idleWatch(idleMs: number): IdleWatch {
  let rearm: (() => void) | undefined;
  return {
    touch(): void {
      rearm?.();
    },
    read(reader): Promise<Awaited<ReturnType<Reader['read']>>> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const silent = new Promise<never>((_resolve, reject) => {
        rearm = (): void => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            reject(openRouterError('unavailable', `no data for ${String(idleMs / 1000)} s`));
          }, idleMs);
        };
        rearm();
      });
      return Promise.race([reader.read(), silent]).finally(() => {
        clearTimeout(timer);
        rearm = undefined;
      });
    },
  };
}

export async function* imageEventData(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  signal: AbortSignal,
  idleMs: number,
): AsyncGenerator<string> {
  const watch = idleWatch(idleMs);
  const alive = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
    transform(bytes, controller): void {
      watch.touch();
      controller.enqueue(bytes);
    },
  });
  const reader = body
    .pipeThrough(alive)
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream())
    .getReader();
  try {
    while (!signal.aborted) {
      const { done, value } = await watch.read(reader);
      if (done || value.data === DONE) return;
      yield value.data;
    }
  } finally {
    await reader.cancel().catch((cause: unknown) => {
      log.debug('stream.cancel_failed', () => ({ error: describeFailure(cause).message }));
    });
  }
}
