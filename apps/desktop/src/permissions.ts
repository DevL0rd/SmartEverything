import { APP_START_URL, isAppOrigin } from './origin.js';

export interface PermissionQuestion {
  readonly permission: string;
  readonly requestingUrl: string | undefined;
  readonly mediaTypes: readonly string[];
}

const GRANTED_WITHOUT_MEDIA = new Set(['fullscreen', 'clipboard-sanitized-write']);

function isMicrophoneOnly(mediaTypes: readonly string[]): boolean {
  return mediaTypes.length > 0 && mediaTypes.every((mediaType) => mediaType === 'audio');
}

export function isPermissionGranted(
  question: PermissionQuestion,
  startUrl: string = APP_START_URL,
): boolean {
  if (!isAppOrigin(question.requestingUrl, startUrl)) {
    return false;
  }
  if (question.permission === 'media') {
    return isMicrophoneOnly(question.mediaTypes);
  }
  return GRANTED_WITHOUT_MEDIA.has(question.permission);
}

export function isSafeExternalUrl(candidate: string): boolean {
  return URL.canParse(candidate) && new URL(candidate).protocol === 'https:';
}
