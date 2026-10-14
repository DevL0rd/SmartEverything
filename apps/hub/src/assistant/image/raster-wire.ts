import { z } from 'zod';
import { IMAGE_BYTES_MAX, IMAGE_PREVIEW_BYTES_MAX } from '@smarteverything/domain';
import {
  RASTER_REQUEST,
  RASTER_REPLY,
  type RasterRequest,
  type RasterReply,
} from './raster-protocol';

function rasterBase64(maximum: number): z.ZodPipe<z.ZodString, z.ZodTransform<Buffer, string>> {
  return z
    .string()
    .min(4)
    .max(Math.ceil(maximum / 3) * 4)
    .transform((encoded, context) => {
      const content = Buffer.from(encoded, 'base64');
      if (
        content.length === 0 ||
        content.length > maximum ||
        content.toString('base64') !== encoded
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Raster IPC content must be bounded canonical base64.',
        });
        return z.NEVER;
      }
      return content;
    });
}
const IMAGE_BASE64 = rasterBase64(IMAGE_BYTES_MAX);
const [PROBE_REQUEST, VALIDATE_REQUEST, PREVIEW_REQUEST] = RASTER_REQUEST.options;
const [READY_REPLY, VALIDATED_REPLY, PREVIEW_REPLY, ERROR_REPLY] = RASTER_REPLY.options;
export const RASTER_REQUEST_WIRE = z.discriminatedUnion('kind', [
  PROBE_REQUEST,
  VALIDATE_REQUEST.extend({ content: IMAGE_BASE64 }),
  PREVIEW_REQUEST.extend({ content: IMAGE_BASE64 }),
]);
export const RASTER_REPLY_WIRE = z.discriminatedUnion('kind', [
  READY_REPLY,
  VALIDATED_REPLY,
  PREVIEW_REPLY.extend({ content: rasterBase64(IMAGE_PREVIEW_BYTES_MAX) }),
  ERROR_REPLY,
]);
export function rasterRequestWire(request: RasterRequest): z.input<typeof RASTER_REQUEST_WIRE> {
  if (request.kind === 'probe') return request;
  return { ...request, content: request.content.toString('base64') };
}
export function rasterReplyWire(reply: RasterReply): z.input<typeof RASTER_REPLY_WIRE> {
  if (reply.kind !== 'preview') return reply;
  return { ...reply, content: reply.content.toString('base64') };
}
