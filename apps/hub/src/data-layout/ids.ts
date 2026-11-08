import { z } from 'zod';

function isSingleSegment(value: string): boolean {
  return (
    value !== '' &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\0')
  );
}

const SEGMENT = z.string().refine(isSingleSegment, {
  message: 'must be one path segment: not empty, not "." or "..", no slash, backslash or NUL',
});

export const PROFILE_ID = SEGMENT;
export const CHAT_ID = SEGMENT;
export const ATTACHMENT_ID = SEGMENT;
export const ATTACHMENT_NAME = SEGMENT;
export const DEVICE_ID = SEGMENT;
export const ROOT_ID = SEGMENT;
export const ITEM_ID = SEGMENT;
export const PLUGIN_ID = SEGMENT;
export const PROVIDER_ID = SEGMENT;
