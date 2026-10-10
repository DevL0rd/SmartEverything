const DONE = '[DONE]';

function dataOf(event: string): string | null {
  const lines = event
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  return lines.length === 0 ? null : lines.join('\n');
}

export async function* sseData(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const data = dataOf(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (data === DONE) {
          return;
        }
        if (data !== null) {
          yield data;
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
