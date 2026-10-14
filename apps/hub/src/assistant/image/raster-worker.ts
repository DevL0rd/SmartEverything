import { versions, platform, arch } from 'node:process';
import { RASTER_REPLY, type RasterReply } from './raster-protocol';
import { decodeRaster } from './raster-decoder';
import { ImageOperationError } from './errors';
import { RASTER_REQUEST_WIRE, rasterReplyWire } from './raster-wire';

function reply(value: RasterReply): void {
  const parsed = RASTER_REPLY.parse(value);
  if (process.send === undefined) process.exit(1);
  process.send(rasterReplyWire(parsed), (error) => {
    process.exit(error instanceof Error ? 1 : 0);
  });
}
async function execute(value: unknown): Promise<void> {
  try {
    const request = RASTER_REQUEST_WIRE.parse(value);
    if (request.kind === 'probe')
      throw new ImageOperationError('unknown', 'Probe completed during handshake.');
    reply(await decodeRaster(request));
  } catch (cause) {
    const code = cause instanceof ImageOperationError ? cause.code : 'invalid_media';
    reply({ kind: 'error', code: code === 'limit' || code === 'invalid_media' ? code : 'unknown' });
  }
}
if (
  versions['electron'] !== undefined ||
  Number(versions.node.split('.')[0]) < 24 ||
  process.send === undefined
)
  process.exit(1);
process.once('disconnect', () => process.exit(1));
process.once('message', (value: unknown) => {
  void execute(value);
});
process.send(
  RASTER_REPLY.parse({
    kind: 'ready',
    nodeMajor: Number(versions.node.split('.')[0]),
    platform,
    arch,
    electron: false,
  }),
);
