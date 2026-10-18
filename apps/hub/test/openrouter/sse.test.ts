import { describe, expect, it } from 'vitest';
import { sseData } from '../../src/openrouter/sse';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller): void {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collected(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  idleMs?: number,
): Promise<string[]> {
  const data: string[] = [];
  for await (const item of sseData(body, new AbortController().signal, idleMs)) data.push(item);
  return data;
}

describe('server-sent event data', () => {
  it('reads events split across chunks, CRLF line ends, comments and multi-line data', async () => {
    const data = await collected(
      streamOf(': keep-alive\r\n\r\ndata: {"a"', ':1}\r\n\r\ndata: one\ndata: two\n\n'),
    );
    expect(data).toEqual(['{"a":1}', 'one\ntwo']);
  });

  it('stops at the DONE marker', async () => {
    expect(await collected(streamOf('data: 1\n\ndata: [DONE]\n\ndata: 2\n\n'))).toEqual(['1']);
  });

  it('fails when the stream goes quiet for longer than the idle limit', async () => {
    const encoder = new TextEncoder();
    const quiet = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller): void {
        controller.enqueue(encoder.encode('data: 1\n\n'));
      },
    });
    await expect(collected(quiet, 20)).rejects.toThrow('no data for');
  });

  it('keeps waiting while keep-alive comments arrive within the idle limit', async () => {
    const encoder = new TextEncoder();
    const slow = new ReadableStream<Uint8Array<ArrayBuffer>>({
      async start(controller): Promise<void> {
        for (let beat = 0; beat < 6; beat += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          controller.enqueue(encoder.encode(': OPENROUTER PROCESSING\n\n'));
        }
        controller.enqueue(encoder.encode('data: done\n\n'));
        controller.close();
      },
    });
    expect(await collected(slow, 60)).toEqual(['done']);
  });
});
