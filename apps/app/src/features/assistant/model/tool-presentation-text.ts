import { z } from 'zod';

const RECORD = z.record(z.string(), z.unknown());
const MAX_LINE_LENGTH = 180;
const PRIVATE_TEXT = /\[redacted\]|secret|password|bearer\s|api[_ -]?key|token\s*[:=]/i;
const TECHNICAL_TEXT =
  /[{}[\]<>]|(?:^|\s)(?:\/[\w.-]+){2,}|\b(?:mcp__|Traceback|TypeError|Error:)|```|^(?:pnpm|npm|yarn|bun|bash|python|rg|cat|git)\s/;

export function reportedRecord(text: string | null): Readonly<Record<string, unknown>> | null {
  if (text === null) return null;
  try {
    const parsed = RECORD.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function readableToolLine(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const line = text.trim();
  if (
    line === '' ||
    line.length > MAX_LINE_LENGTH ||
    /[\r\n]/.test(line) ||
    PRIVATE_TEXT.test(line) ||
    TECHNICAL_TEXT.test(line)
  )
    return null;
  return line;
}

export function reportedLine(
  record: Readonly<Record<string, unknown>> | null,
  keys: readonly string[],
): string | null {
  if (record === null) return null;
  for (const key of keys) {
    const line = readableToolLine(record[key]);
    if (line !== null) return line;
  }
  return null;
}

export function fileLabel(record: Readonly<Record<string, unknown>> | null): string | null {
  if (record === null) return null;
  const path = record['file_path'] ?? record['path'] ?? record['filename'];
  if (typeof path !== 'string' || PRIVATE_TEXT.test(path)) return null;
  return readableToolLine(
    path
      .split(/[\\/]/)
      .filter((part) => part !== '')
      .at(-1),
  );
}

export function toolKey(name: string): string {
  return (name.split('__').at(-1) ?? name)
    .replaceAll(/([a-z])([A-Z])/g, '$1_$2')
    .replaceAll(/[^a-z0-9]+/gi, '_')
    .toLowerCase();
}
