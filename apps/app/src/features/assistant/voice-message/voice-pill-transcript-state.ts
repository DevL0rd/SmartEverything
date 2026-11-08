import { useSyncExternalStore } from 'react';
import { noteKindOf, type AssistantAttachment } from '@smarteverything/domain';
import { ValueStore } from '../../../design/external-store';

export interface MetaTranscript {
  readonly open: boolean;
  readonly onToggle: () => void;
}

const opened = new ValueStore<ReadonlySet<string>>(new Set());

export function toggleVoiceTranscript(attachmentId: string): void {
  opened.update((current) => {
    const next = new Set(current);
    if (next.has(attachmentId)) next.delete(attachmentId);
    else next.add(attachmentId);
    return next;
  });
}

export function voiceTranscriptOpen(attachmentId: string): boolean {
  return opened.get().has(attachmentId);
}

export function voiceClipOf(attachments: readonly AssistantAttachment[]): string | null {
  return attachments.find((attachment) => noteKindOf(attachment.mime) === 'audio')?.id ?? null;
}

export function useVoiceTranscriptOpen(attachmentId: string | null): boolean {
  return useSyncExternalStore(
    opened.subscribe,
    () => attachmentId !== null && voiceTranscriptOpen(attachmentId),
    () => false,
  );
}

export function useVoiceTranscript(
  attachments: readonly AssistantAttachment[],
): MetaTranscript | null {
  const clip = voiceClipOf(attachments);
  const open = useVoiceTranscriptOpen(clip);
  return clip === null
    ? null
    : {
        open,
        onToggle: (): void => {
          toggleVoiceTranscript(clip);
        },
      };
}
