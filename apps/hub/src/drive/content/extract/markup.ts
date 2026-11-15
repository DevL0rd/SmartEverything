const BREAKING = new Set([
  'p',
  'br',
  'tr',
  'td',
  'th',
  'tc',
  'li',
  'div',
  'h',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'section',
  'article',
  'header',
  'footer',
  'title',
  'ul',
  'ol',
  'table',
  'row',
  'tab',
  'line-break',
  'table-cell',
  'table-row',
  'list-item',
  'blockquote',
  'pre',
  'hr',
  'caption',
  'figcaption',
  'dd',
  'dt',
]);

const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  copy: '©',
  reg: '®',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

const INVISIBLE =
  /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>/giu;

const TAG = /<\/?([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)\b[^>]*>/gu;

const ENTITY = /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/giu;

function codePointText(value: number): string {
  return Number.isInteger(value) &&
    value > 0 &&
    value <= 0x10ffff &&
    !(value >= 0xd800 && value <= 0xdfff)
    ? String.fromCodePoint(value)
    : ' ';
}

export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, decimal?: string, hex?: string, name?: string) => {
    if (decimal !== undefined) return codePointText(Number(decimal));
    if (hex !== undefined) return codePointText(Number.parseInt(hex, 16));
    return name === undefined ? whole : (NAMED[name.toLowerCase()] ?? whole);
  });
}

export function markupText(markup: string): string {
  const visible = markup.replace(INVISIBLE, (_whole, tag?: string, cdata?: string) =>
    tag === undefined ? (cdata ?? ' ') : ' ',
  );
  const spaced = visible.replace(TAG, (_whole, _prefix?: string, name?: string) =>
    name !== undefined && BREAKING.has(name.toLowerCase()) ? ' ' : '',
  );
  return decodeEntities(spaced.replace(/<[^>]*>/gu, ''))
    .replace(/\s+/gu, ' ')
    .trim();
}
