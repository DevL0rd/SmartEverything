import type { MediaInfo, PhotoDescription, PhotoDescriptionSet } from '@smarteverything/domain';

export const DESCRIPTION_LABEL = 'Description';

export const ADD_DESCRIPTION = 'Add a description';

export const FROM_FILE = 'From the photo file';

export function descriptionChangeOf(
  draft: string,
  current: PhotoDescription | null,
): PhotoDescriptionSet | null {
  const text = draft.trim();
  const next = text === '' ? null : text;
  return next === (current?.text ?? null) ? null : { text: next };
}

export function describedMedia(media: MediaInfo, change: PhotoDescriptionSet): MediaInfo {
  return {
    ...media,
    description: change.text === null ? null : { text: change.text, source: 'manual' },
  };
}

export function savedDescriptionText(change: PhotoDescriptionSet): string {
  return change.text === null ? 'Description removed' : 'Description saved';
}
