import { ValueStore, useValue } from '../../../design/external-store';

interface CallPreview {
  readonly stream: MediaStream;
  readonly mirrored: boolean;
}

export interface CallPreviews {
  readonly sent: CallPreview | null;
  readonly self: CallPreview | null;
}

const NO_PREVIEWS: CallPreviews = { sent: null, self: null };

export const callPreviews = new ValueStore<CallPreviews>(NO_PREVIEWS);

export function useCallPreviews(): CallPreviews {
  return useValue(callPreviews);
}
