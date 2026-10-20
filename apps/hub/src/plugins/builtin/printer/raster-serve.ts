import type { MessagePort } from 'node:worker_threads';
import { pwgRasterPage } from '@smarteverything/ipp';
import { RASTER_PAGE, type RasterReply } from './raster-protocol';

function replyTo(raw: unknown): RasterReply {
  try {
    const page = RASTER_PAGE.parse(raw);
    return { bytes: pwgRasterPage(page).slice() };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The page could not be encoded.' };
  }
}

export function serveRaster(port: Pick<MessagePort, 'on' | 'postMessage'>): void {
  port.on('message', (raw: unknown) => {
    const reply = replyTo(raw);
    port.postMessage(reply, 'bytes' in reply ? [reply.bytes.buffer] : []);
  });
}
