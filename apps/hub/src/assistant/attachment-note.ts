import type { AssistantAttachment } from '@smarteverything/domain';
import { mediaKindOf } from '../transcripts/media-notes';

function sizeOf(file: AssistantAttachment): string {
  return file.width === null || file.height === null
    ? ''
    : `, ${String(file.width)}×${String(file.height)}`;
}

export function attachmentNote(file: AssistantAttachment, transcript: string | null): string {
  const kind = mediaKindOf(file.mime);
  if (kind === null || transcript === null) {
    return `[Attached ${file.name} (${file.mime}${sizeOf(file)})]`;
  }
  if (kind === 'image') {
    return `[image "${file.name}"${sizeOf(file)}, description: ${transcript}]`;
  }
  return `[${kind} "${file.name}", transcript: ${transcript}]`;
}
