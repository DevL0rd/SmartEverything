const BEFORE = 50;
const AFTER = 110;
const ELLIPSIS = '…';

export function snippetOf(text: string, query: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, at - BEFORE);
  const end = Math.min(flat.length, Math.max(at, 0) + query.length + AFTER);
  const lead = start > 0 ? ELLIPSIS : '';
  const tail = end < flat.length ? ELLIPSIS : '';
  return `${lead}${flat.slice(start, end)}${tail}`;
}
