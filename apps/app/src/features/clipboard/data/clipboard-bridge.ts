import type { ClipboardClip } from '@smarteverything/domain';

type Receiver = (clip: ClipboardClip) => void;

let receiver: Receiver | null = null;

export function attachSharedClipReceiver(next: Receiver): () => void {
  receiver = next;
  return (): void => {
    if (receiver === next) receiver = null;
  };
}

export function receiveSharedClip(clip: ClipboardClip): void {
  receiver?.(clip);
}
