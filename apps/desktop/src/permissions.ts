import { APP_START_URL, isAppOrigin } from './origin.js';

export interface PermissionQuestion {
  readonly permission: string;
  readonly requestingUrl: string | undefined;
  readonly mediaTypes: readonly string[];
}

const GRANTED_WITHOUT_MEDIA = new Set([
  'fullscreen',
  'clipboard-sanitized-write',
  'display-capture',
]);

const CALL_MEDIA_TYPES = new Set(['audio', 'video']);

function isCallMedia(mediaTypes: readonly string[]): boolean {
  return mediaTypes.length > 0 && mediaTypes.every((mediaType) => CALL_MEDIA_TYPES.has(mediaType));
}

export function isPermissionGranted(
  question: PermissionQuestion,
  startUrl: string = APP_START_URL,
): boolean {
  if (!isAppOrigin(question.requestingUrl, startUrl)) {
    return false;
  }
  if (question.permission === 'media') {
    return isCallMedia(question.mediaTypes);
  }
  return GRANTED_WITHOUT_MEDIA.has(question.permission);
}

export function isSafeExternalUrl(candidate: string): boolean {
  return URL.canParse(candidate) && new URL(candidate).protocol === 'https:';
}
