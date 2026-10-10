const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}]*\s*){1,3}$/u;

export const CLAMP_LINES = 9;

export function isEmojiOnly(text: string): boolean {
  return EMOJI_ONLY.test(text.trim());
}
