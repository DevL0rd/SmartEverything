import { z } from 'zod';

export const RESERVED_ROOTS = ['trigger', 'inputs', 'vars', 'home', 'run'] as const;

export type ReservedRoot = (typeof RESERVED_ROOTS)[number];

const RESERVED_WORDS: ReadonlySet<string> = new Set(RESERVED_ROOTS);

export const IDENT_PATTERN = /^[a-z][A-Za-z0-9_]{0,39}$/;

export function isReservedWord(word: string): boolean {
  return RESERVED_WORDS.has(word);
}

export function isReservedRoot(word: string): word is ReservedRoot {
  return RESERVED_WORDS.has(word);
}

export const IDENT = z
  .string()
  .regex(
    IDENT_PATTERN,
    'an identifier starts with a lowercase letter and has at most 40 letters, digits or underscores',
  )
  .refine((word) => !isReservedWord(word), {
    message: 'trigger, inputs, vars, home and run are wire sources and cannot be used as names',
  });

export type Ident = z.infer<typeof IDENT>;
