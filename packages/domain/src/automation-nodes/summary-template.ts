import { IDENT_PATTERN } from '../automation-v3/ident';
import type { PortValue } from '../automation-v3/port-value';

export type NodeSummaryPart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'chip'; readonly port: string; readonly text: string };

export const SUMMARY_ABSENT = '…';
export const SUMMARY_CHIP_LIMIT = 40;

const PLACEHOLDER_SPLIT = /(\{[^{}]*\})/;

function placeholderOf(piece: string): string | undefined {
  return piece.startsWith('{') && piece.endsWith('}') ? piece.slice(1, -1) : undefined;
}

export function summaryPlaceholders(template: string): readonly string[] {
  return template.split(PLACEHOLDER_SPLIT).flatMap((piece) => placeholderOf(piece) ?? []);
}

export function summaryProblems(template: string, portNames: readonly string[]): readonly string[] {
  const problems: string[] = [];
  if (template.trim() === '') problems.push('the summary template is empty');
  for (const piece of template.split(PLACEHOLDER_SPLIT)) {
    const name = placeholderOf(piece);
    if (name !== undefined) {
      if (!IDENT_PATTERN.test(name)) problems.push(`"${piece}" is not a port placeholder`);
      else if (!portNames.includes(name))
        problems.push(`placeholder {${name}} names no input port`);
    } else if (/[{}]/.test(piece)) {
      problems.push(`stray brace in "${piece}"`);
    }
  }
  return problems;
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') return SUMMARY_ABSENT;
  return flat.length > SUMMARY_CHIP_LIMIT ? `${flat.slice(0, SUMMARY_CHIP_LIMIT - 1)}…` : flat;
}

function literalText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null) return 'nothing';
  return JSON.stringify(value);
}

export function portValueText(value: PortValue | undefined): string {
  if (value === undefined) return SUMMARY_ABSENT;
  if ('lit' in value) return clip(literalText(value.lit));
  return clip(`${value.wire.from}.${value.wire.port}`);
}

export function renderSummary(
  template: string,
  ports: Readonly<Record<string, PortValue | undefined>>,
): readonly NodeSummaryPart[] {
  const parts: NodeSummaryPart[] = [];
  for (const piece of template.split(PLACEHOLDER_SPLIT)) {
    if (piece === '') continue;
    const port = placeholderOf(piece);
    if (port !== undefined) {
      parts.push({ kind: 'chip', port, text: portValueText(ports[port]) });
    } else {
      parts.push({ kind: 'text', text: piece });
    }
  }
  return parts;
}

export function summaryText(parts: readonly NodeSummaryPart[]): string {
  return parts.map((part) => part.text).join('');
}
