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

export interface ScrollMessage {
  readonly key: string;
  readonly at: string;
  readonly streaming: boolean;
  readonly reply: boolean;
}

export function pinTransition(
  pinned: ScrollMessage | null,
  newest: ScrollMessage | null,
): 'keep' | 'release' | 'follow' {
  if (pinned === null) return 'keep';
  if (newest === null) return 'release';
  if (newest.key === pinned.key) {
    return pinned.streaming && !newest.streaming ? 'release' : 'keep';
  }
  return newest.reply && newest.at > pinned.at ? 'follow' : 'release';
}
