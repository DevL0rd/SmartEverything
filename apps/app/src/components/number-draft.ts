export interface DraftRange {
  readonly min: number;
  readonly max: number;
}

export function sanitizeDraft(text: string): string {
  const cleaned = text.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const dot = cleaned.indexOf('.');
  return dot === -1
    ? cleaned
    : `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, '')}`;
}

export function digitsDraft(text: string): string {
  return text.replace(/\D/g, '').slice(0, 2);
}

function parsed(draft: string): number | null {
  if (draft === '' || draft === '.') {
    return null;
  }
  const value = Number(draft);
  return Number.isFinite(value) ? value : null;
}

export function committedValue(draft: string, range: DraftRange): number | null {
  const value = parsed(draft);
  return value !== null && value >= range.min && value <= range.max ? value : null;
}

export function settledValue(draft: string, range: DraftRange): number | null {
  const value = parsed(draft);
  return value === null ? null : Math.min(range.max, Math.max(range.min, value));
}
