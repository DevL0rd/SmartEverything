const RASTER_TYPES = new Set([
  'image/apng',
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/jxl',
  'image/png',
  'image/tiff',
  'image/vnd.microsoft.icon',
  'image/webp',
  'image/x-icon',
  'image/x-ms-bmp',
]);
const TEXT_TYPES = new Set(['text/plain', 'application/json']);
const PLAYABLE = /^(?:audio|video)\/[a-z0-9][a-z0-9.+_-]*$/u;

export function inlineAssistantAttachmentMime(mime: string): string | null {
  const type = mime.split(';', 1).join('').trim().toLowerCase();
  return RASTER_TYPES.has(type) || TEXT_TYPES.has(type) || PLAYABLE.test(type) ? type : null;
}
