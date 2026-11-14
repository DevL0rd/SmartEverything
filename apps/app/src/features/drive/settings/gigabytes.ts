const GIB = 1024 ** 3;

const DECIMAL_NUMBER = /^\d+(\.\d+)?$/;

export const GIGABYTES_PROBLEM = 'Use a size in GB, such as 250 or 1.5';

class GigabytesEntryError extends Error {
  override readonly name = 'GigabytesEntryError';
}

export function gigabytesOf(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!DECIMAL_NUMBER.test(trimmed)) {
    throw new GigabytesEntryError(`${trimmed} is not a size in GB.`);
  }
  return Math.round(Number(trimmed) * GIB);
}

export function gigabytesProblemOf(text: string): string | null {
  return DECIMAL_NUMBER.test(text.trim()) ? null : GIGABYTES_PROBLEM;
}

export function gigabytesInitialOf(value: number | null): string {
  return value === null ? '' : String(Math.round((value / GIB) * 10) / 10);
}
