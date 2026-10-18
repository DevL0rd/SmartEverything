import { z } from 'zod';

export async function nextText(reader: ReadableStreamDefaultReader<unknown>): Promise<string> {
  const chunk = await reader.read();
  return new TextDecoder().decode(z.instanceof(Uint8Array).parse(chunk.value));
}
