import { emojiCategories, emojiOf, type EmojiChoice } from '@smarteverything/domain';

export const COMMON_EMOJI = 'Common';

const COMMON_GLYPHS = [
  '👍',
  '❤️',
  '😂',
  '🎉',
  '🙌',
  '🔥',
  '👏',
  '🙏',
  '🤔',
  '😮',
  '😢',
  '👀',
  '💯',
  '✅',
  '👎',
  '✨',
  '💡',
  '🤝',
  '🥳',
  '😊',
  '😅',
] as const;

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  'Smileys & Emotion': 'Smileys',
  'People & Body': 'People',
  Component: 'Style',
  'Animals & Nature': 'Nature',
  'Food & Drink': 'Food',
  'Travel & Places': 'Travel',
};

export function emojiPickerCategories(): readonly {
  readonly name: string;
  readonly label: string;
}[] {
  return [
    { name: COMMON_EMOJI, label: COMMON_EMOJI },
    ...emojiCategories().map(({ name }) => ({ name, label: CATEGORY_LABELS[name] ?? name })),
  ];
}

function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s_:-]+/u)
    .filter(Boolean);
}

interface SearchEntry {
  readonly choice: EmojiChoice;
  readonly label: string;
}

let searchIndex: readonly SearchEntry[] | undefined;

function emojiIndex(): readonly SearchEntry[] {
  searchIndex ??= emojiCategories().flatMap(({ name, choices }) =>
    choices.map((choice) => ({
      choice,
      label: `${choice.name} ${name}`.toLowerCase(),
    })),
  );
  return searchIndex;
}

function commonChoices(): EmojiChoice[] {
  return COMMON_GLYPHS.flatMap((glyph) => {
    const choice = emojiOf(glyph);
    return choice === undefined ? [] : [choice];
  });
}

export function emojiMatches(category: string, text: string): readonly EmojiChoice[] {
  if (text.trim() === '') {
    return category === COMMON_EMOJI
      ? commonChoices()
      : (emojiCategories().find((group) => group.name === category)?.choices ?? []);
  }
  const exact = emojiOf(text.trim());
  if (exact !== undefined) return [exact];
  const words = searchWords(text);
  if (words.length === 0) return [];
  return emojiIndex()
    .filter(({ label }) => words.every((word) => label.includes(word)))
    .map(({ choice }) => choice);
}

export function emojiPage<T>(
  items: readonly T[],
  offset: number,
  size: number,
): {
  readonly entries: readonly T[];
  readonly start: number;
  readonly end: number;
  readonly current: number;
  readonly total: number;
} {
  const total = Math.ceil(items.length / size);
  const current = Math.max(0, Math.min(total - 1, Math.floor(offset / size)));
  const start = current * size;
  const entries = items.slice(start, start + size);
  return { entries, start, end: start + entries.length, current, total };
}
