export const STICK_PX = 80;

export interface ScrollSample {
  readonly offset: number;
  readonly contentHeight: number;
}

export function stuckAfterScroll(
  stuck: boolean,
  previous: ScrollSample | null,
  sample: ScrollSample,
): boolean {
  if (previous !== null && previous.contentHeight !== sample.contentHeight) {
    return stuck;
  }
  return sample.offset <= STICK_PX;
}

export function shouldFollowContent(
  stuck: boolean,
  previousHeight: number,
  height: number,
): boolean {
  return stuck && previousHeight !== height;
}

export function finishedStreaming(
  previous: { readonly key: string; readonly streaming: boolean } | null,
  next: { readonly key: string; readonly streaming: boolean } | null,
): boolean {
  return (
    previous !== null &&
    next !== null &&
    previous.key === next.key &&
    previous.streaming &&
    !next.streaming
  );
}
