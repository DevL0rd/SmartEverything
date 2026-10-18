import { committedValue } from '../../../components/number-draft';

const ANY_NUMBER = { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY } as const;

export function numberText(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '' : String(value);
}

export function parsedNumber(text: string): number | null {
  return committedValue(text.trim().replace(',', '.'), ANY_NUMBER);
}

export function shownText(draft: string | null, value: number | undefined): string {
  return draft ?? numberText(value);
}

export function numberValid(text: string, optional: boolean): boolean {
  return (optional && text.trim() === '') || parsedNumber(text) !== null;
}
