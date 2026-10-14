import { AsyncLocalStorage } from 'node:async_hooks';
import { isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import type { Context } from '@deepseek-ai/cordis';

const ordinary = new AsyncLocalStorage<boolean>();

export function ordinaryModelRequest(): boolean {
  return ordinary.getStore() === true;
}
export function observeModelRequestContext(ctx: Context): void {
  ctx.on('llm/stream', (options, next) => scopedModelStream(isAgentLoopRequest(options), next));
}
async function* scopedModelStream(
  marked: boolean,
  stream: () => AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  const iterator = ordinary.run(marked, () => stream()[Symbol.asyncIterator]());
  let complete = false;
  try {
    for (;;) {
      const item = await ordinary.run(marked, () => iterator.next());
      if (item.done === true) {
        complete = true;
        return;
      }
      yield item.value;
    }
  } finally {
    if (!complete && iterator.return !== undefined)
      await ordinary.run(marked, () => iterator.return?.());
  }
}
