export interface SignatureInput {
  readonly component: string;
  readonly event: string;
  readonly failureName: string | null;
  readonly failureMessage: string | null;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX = /\b(?:0x)?[0-9a-f]{8,}\b/gi;
const NUMBER = /\d+(?:\.\d+)?/g;
const ADDRESS = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const QUOTED = /"[^"]*"|'[^']*'/g;
const SPACE = /\s+/g;

export function signatureText(text: string): string {
  return text
    .replace(UUID, ' ')
    .replace(ADDRESS, ' ')
    .replace(HEX, ' ')
    .replace(NUMBER, ' ')
    .replace(QUOTED, ' ')
    .replace(SPACE, ' ')
    .trim()
    .toLowerCase();
}

const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;

function stableHash(text: string): string {
  const halves = [FNV_OFFSET, FNV_OFFSET ^ 0x5bf03635];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    for (let index = 0; index < halves.length; index += 1) {
      const current = halves[index] ?? FNV_OFFSET;
      halves[index] = Math.imul(current ^ code, FNV_PRIME) >>> 0;
    }
  }
  return halves.map((half) => half.toString(16).padStart(8, '0')).join('');
}

export function errorSignature(input: SignatureInput): string {
  const name = signatureText(input.failureName ?? '');
  const message = signatureText(input.failureMessage ?? '');
  const key = [input.component, input.event, name, message].join('\u0000');
  return stableHash(key);
}
