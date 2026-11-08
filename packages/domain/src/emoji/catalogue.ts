import { z } from 'zod';
import unicodeEmoji from './unicode-16.json';

export interface EmojiChoice {
  readonly glyph: string;
  readonly name: string;
}

const CATALOGUE = z.record(z.string(), z.array(z.tuple([z.string(), z.string()])));

interface EmojiCategory {
  readonly name: string;
  readonly choices: readonly EmojiChoice[];
}

interface EmojiCatalogue {
  readonly groups: readonly EmojiCategory[];
  readonly byGlyph: ReadonlyMap<string, EmojiChoice>;
}

function loadCatalogue(): EmojiCatalogue {
  const groups = Object.entries(CATALOGUE.parse(unicodeEmoji)).map(([name, entries]) => ({
    name,
    choices: entries.map(([glyph, label]) => ({ glyph, name: label })),
  }));
  const byGlyph = new Map(
    groups.flatMap(({ choices }) => choices.map((choice) => [choice.glyph, choice] as const)),
  );
  return { groups, byGlyph };
}

let cached: EmojiCatalogue | undefined;

function catalogue(): EmojiCatalogue {
  cached ??= loadCatalogue();
  return cached;
}

export function emojiCategories(): readonly EmojiCategory[] {
  return catalogue().groups;
}

export const EMOJI_SEQUENCE = z
  .string()
  .refine(
    (value) => catalogue().byGlyph.has(value),
    'Choose one fully qualified Unicode emoji or standalone emoji component from the catalogue.',
  );

export function emojiOf(glyph: string): EmojiChoice | undefined {
  return catalogue().byGlyph.get(glyph);
}
