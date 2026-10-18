const TEXT_SUMMARY_MAX = 300;
const PRINTABLE = /^[\t\n\r\x20-\x7e]*$/;

export const SUMMARY_MAX = 500;

function entriesOf(values: object): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' | ')
    .slice(0, SUMMARY_MAX);
}

function jsonValues(raw: string): object | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      return null;
    }
    throw cause;
  }
}

export function bodySummary(body: Buffer, contentType = ''): string {
  if (body.length === 0) {
    return '';
  }
  const raw = body.toString('utf8');
  const values = contentType.includes('json') ? jsonValues(raw) : null;
  if (values !== null) {
    return entriesOf(values);
  }
  if (contentType.includes('urlencoded')) {
    return entriesOf(Object.fromEntries(new URLSearchParams(raw)));
  }
  return PRINTABLE.test(raw)
    ? raw.slice(0, TEXT_SUMMARY_MAX)
    : `${String(body.length)} bytes of binary data`;
}
